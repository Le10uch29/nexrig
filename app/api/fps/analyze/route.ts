import { randomUUID } from "node:crypto";
import { GAMES } from "@/data/games";
import { checkBuild } from "@/features/compatibility/engine";
import { memoryOf } from "@/lib/benchmark-engine/estimate";
import { analyzeBuild, ANALYSIS_RESOLUTIONS, reconcile, selectCandidates, transferCandidates, type AnalysisReport, type AnalysisTarget } from "@/lib/fps-engine/analysis";
import { fingerprint, type AnalysisEvent, type StageId } from "@/lib/fps-engine/analysis-stages";
import { badRequest } from "@/lib/fps-engine/api-schemas";
import { analyzeSchema } from "@/lib/fps-engine/analyze-schema";
import { fpsCaveats } from "@/lib/fps-engine/engine";
import { disabledSourceIds } from "@/lib/fps-engine/source-registry";
import { getBenchmarkStore, StoreError, type BenchmarkFilter } from "@/lib/fps-engine/store";
import { hardwareRepository } from "@/lib/hardware/repository";
import { readLimitedText } from "@/lib/server/admin-auth";
import { clientKey, createRateLimiter } from "@/lib/server/rate-limit";
import type { BenchmarkRecord } from "@/types/benchmark";

/**
 * NexRig Benchmark, mode A: runs the multi-source analysis and streams progress as NDJSON — one
 * AnalysisEvent per line. Every stage is a real step (compatibility rules, store queries, matching,
 * normalisation, reconciliation). A failing stage is reported as "error" and the run continues with
 * what it has. The client cancels by aborting the request.
 *
 * External sites are never queried here: their results are already in the database (admin import),
 * so a run costs a few indexed queries, not dozens of HTTP requests.
 *
 * Cache: per normalised configuration + settings + games + data version (store.dataVersion(): it
 * changes on any insert, edit, verification change or delete — plus the disabled sources), for
 * CACHE_TTL_MS, per server instance. `force: true` skips it.
 * Limits: RATE runs per client per window; the same configuration cannot run twice at once.
 */
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 100;
const cache = new Map<string, { report: AnalysisReport; warnings: string[]; at: number }>();
const inFlight = new Set<string>();
const limiter = createRateLimiter(12, 5 * 60 * 1000);

const safeMessage = (e: unknown) => (e instanceof StoreError ? e.message : "Хранилище замеров недоступно.");

export async function POST(request: Request) {
  const body = await readLimitedText(request, 8_000);
  if (!body.ok) return body.response;
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return Response.json({ error: "Ожидается JSON." }, { status: 400 });
  }
  const parsed = analyzeSchema.safeParse(json);
  if (!parsed.success) return badRequest(parsed.error);
  const q = parsed.data;

  const cpu = hardwareRepository.byId(q.cpuId);
  const gpu = hardwareRepository.byId(q.gpuId);
  if (cpu?.category !== "cpu" || gpu?.category !== "gpu") return Response.json({ error: "Процессор или видеокарта не найдены в каталоге." }, { status: 422 });
  if (q.selection && (q.selection.cpu !== cpu.id || q.selection.gpu !== gpu.id)) return Response.json({ error: "Состав сборки не совпадает с выбранными процессором и видеокартой." }, { status: 422 });
  const games = q.gameIds ? GAMES.filter((g) => q.gameIds!.includes(g.id)) : GAMES;
  if (!games.length) return Response.json({ error: "Не выбрано ни одной известной игры." }, { status: 422 });

  const configKey = fingerprint({ cpu: cpu.id, gpu: gpu.id, ram: q.ram ?? null, selection: q.selection ?? null, settings: q.settings, games: games.map((g) => g.id) });
  const client = clientKey(request);
  const runKey = `${client}|${configKey}`;
  if (inFlight.has(runKey)) return Response.json({ error: "Анализ этой сборки уже выполняется — дождитесь результата или отмените его." }, { status: 409 });
  const limit = limiter.take(client);
  if (!limit.ok) return Response.json({ error: `Слишком много запусков. Повторите через ${limit.retryAfterS} с.` }, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });

  const target: AnalysisTarget = {
    cpu,
    gpu,
    memory: q.ram ? memoryOf({ type: q.ram.type, speedMtps: q.ram.speedMtps }, q.ram.modules) : undefined,
    ramGb: q.ram?.moduleGb ? q.ram.moduleGb * q.ram.modules : undefined,
    settings: q.settings,
  };
  const buildVersion = q.buildVersion ?? configKey;
  const signal = request.signal;
  const encoder = new TextEncoder();
  inFlight.add(runKey);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (e: AnalysisEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          closed = true;
        }
      };
      const finish = () => {
        inFlight.delete(runKey);
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      };
      const stage = (id: StageId, status: "running" | "done" | "empty" | "error", detail?: string) => send({ type: "stage", id, status, detail });
      const aborted = () => signal.aborted || closed;

      try {
        const warnings: string[] = [];
        const caveats: string[] = [];

        // 1. The build: the request body is the frozen configuration.
        send({ type: "start", runId: randomUUID(), buildVersion, configKey, cached: false, cachedAt: null });
        stage("build", "running");
        const missing = [!q.ram && "память", !q.selection?.motherboard && "материнская плата", !q.selection?.psu && "блок питания"].filter(Boolean);
        stage("build", "done", `${cpu.name} + ${gpu.name}${target.memory ? `, ${target.memory.type} ${target.memory.speedMtps} МТ/с × ${target.memory.modules}` : ""}.${missing.length ? ` Не указаны: ${missing.join(", ")}.` : ""}`);
        if (aborted()) return finish();

        // 2. Compatibility (the same rules as the builder).
        stage("compat", "running");
        if (q.selection) {
          const report = checkBuild(q.selection);
          caveats.push(...fpsCaveats(report.checks));
          const bad = report.counts.incompatible;
          stage("compat", "done", bad ? `Несовместимостей: ${bad}; предупреждений: ${report.counts.warning}. FPS считается для пары CPU + GPU так, как если бы сборку удалось собрать.` : `Несовместимостей нет; предупреждений: ${report.counts.warning}.`);
        } else {
          stage("compat", "empty", "Состав сборки не передан — проверены только процессор и видеокарта.");
        }
        if (aborted()) return finish();

        // 3. Sources: store reachable, which sources are off, data version.
        const store = getBenchmarkStore();
        stage("sources", "running");
        let disabled = new Set<string>();
        let dataVersion = "unknown";
        try {
          await store.ping();
          disabled = await disabledSourceIds(store);
          const verified = await store.count({ verification: "verified", excludeSources: [...disabled] });
          // Any insert, edit, verification change or delete changes the version → the cache misses.
          dataVersion = `${await store.dataVersion()}|${[...disabled].sort().join(",")}`;
          stage("sources", verified ? "done" : "empty", `Проверенных замеров в базе: ${verified}.${disabled.size ? ` Отключены администратором: ${[...disabled].join(", ")}.` : ""} Внешние сайты не опрашиваются при запуске — их результаты вносятся в базу импортом.`);
        } catch (e) {
          const msg = safeMessage(e);
          warnings.push(`Источники: ${msg}`);
          stage("sources", "error", msg);
        }
        if (aborted()) return finish();

        const cacheKey = `${configKey}|${dataVersion}`;
        const hit = dataVersion !== "unknown" ? cache.get(cacheKey) : undefined;
        if (hit && !q.force && Date.now() - hit.at < CACHE_TTL_MS) {
          const cachedAt = new Date(hit.at).toISOString();
          for (const id of ["similar", "normalize", "ranges", "reliability"] as const) stage(id, "done", "Из кэша: данные не менялись.");
          stage("report", "done", `Результат из кэша от ${cachedAt}.`);
          send({ type: "result", report: { ...hit.report, limitations: [...caveats, ...hit.report.limitations.filter((l) => !caveats.includes(l))] }, cached: true, cachedAt, warnings: hit.warnings });
          return finish();
        }

        // 4. Similar configurations: each query may fail on its own.
        stage("similar", "running");
        const byId = new Map<string, BenchmarkRecord>();
        const lookups: [string, BenchmarkFilter][] = [
          ["эта пара CPU + GPU", { cpuId: cpu.id, gpuId: gpu.id }],
          [gpu.name, { gpuId: gpu.id }],
          [cpu.name, { cpuId: cpu.id }],
          ...games.map((g): [string, BenchmarkFilter] => [g.title, { gameId: g.id }]),
        ];
        let failed = 0;
        const found: string[] = [];
        for (const [label, filter] of lookups) {
          if (aborted()) return finish();
          try {
            const rows = await store.query({ ...filter, excludeSources: [...disabled], verification: "verified" });
            for (const r of rows) byId.set(r.id, r);
            if (rows.length && found.length < 3) found.push(`${label}: ${rows.length}`);
          } catch (e) {
            failed++;
            if (failed === 1) warnings.push(safeMessage(e));
          }
        }
        const records = [...byId.values()];
        stage(
          "similar",
          failed === lookups.length ? "error" : records.length ? "done" : "empty",
          failed === lookups.length ? "Не удалось получить тесты." : records.length ? `Найдено проверенных тестов: ${records.length} (${found.join("; ")})${failed ? `; запросов с ошибкой: ${failed}` : ""}.` : "Подходящих проверенных тестов в базе нет.",
        );
        if (aborted()) return finish();

        const pairs = games.flatMap((g) => ANALYSIS_RESOLUTIONS.map((res) => ({ g, res })));
        const now = new Date();

        // 5. Normalisation: comparable settings, tiers.
        stage("normalize", "running");
        const sets = pairs.map(({ g, res }) => ({ g, res, set: selectCandidates(target, g, res, records, disabled) }));
        const comparable = sets.reduce((n, s) => n + s.set.candidates.length, 0);
        const fgApart = sets.reduce((n, s) => n + (s.set.excluded["генерация кадров (FG) не смешивается с обычным FPS"] ?? 0), 0);
        stage("normalize", comparable ? "done" : "empty", comparable ? `Сопоставимых пар «тест → игра и разрешение»: ${comparable}${fgApart ? `; тесты с генерацией кадров учтены отдельно: ${fgApart}` : ""}.` : "Тестов с сопоставимыми настройками (RT, апскейлинг, генерация кадров) нет.");
        if (aborted()) return finish();

        // 6. Ranges: transfer to the build.
        stage("ranges", "running");
        const moved = sets.map((s) => ({ ...s, t: transferCandidates(target, s.g, s.res, s.set.candidates, now) }));
        const ok = moved.reduce((n, m) => n + m.t.filter((x) => !x.refused).length, 0);
        const refused = moved.reduce((n, m) => n + m.t.filter((x) => x.refused).length, 0);
        stage("ranges", "done", ok ? `Перенесено на вашу сборку: ${ok}${refused ? `, отказано (слишком разные системы): ${refused}` : ""}. Где тестов нет — модель.` : "Тестов для переноса нет — диапазоны по модели.");
        if (aborted()) return finish();

        // 7. Reliability: outliers, contradictions, stale tests.
        stage("reliability", "running");
        const rec = moved.map((m) => reconcile(m.t));
        const outliers = rec.reduce((n, r) => n + r.rejected.filter((x) => x.reason.startsWith("выброс")).length, 0);
        const contradictions = rec.filter((r) => r.contradictory).length;
        const stale = moved.reduce((n, m) => n + m.t.filter((x) => x.stale && !x.refused).length, 0);
        stage("reliability", ok ? "done" : "empty", ok ? `Выбросов исключено: ${outliers}; противоречивых результатов: ${contradictions}; устаревших тестов: ${stale}.` : "Нет тестов для проверки — у модельных значений низкая уверенность.");
        if (aborted()) return finish();

        // 8. Report.
        stage("report", "running");
        const report = analyzeBuild({ target, games, records, disabledSources: disabled, caveats, now });
        stage("report", "done", `Игр: ${games.length}; измерено — ${report.counts.verified}, перенос — ${report.counts.close}, модель — ${report.counts.model}, нет данных — ${report.counts.insufficient}.`);
        if (warnings.length) report.limitations.unshift("Часть источников была недоступна — результат рассчитан по тем данным, что удалось получить.");
        // Partial runs are not cached: a retry should try the failed sources again.
        if (!warnings.length && dataVersion !== "unknown") {
          if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
          cache.set(cacheKey, { report, warnings, at: Date.now() });
        }
        send({ type: "result", report, cached: false, cachedAt: null, warnings });
      } catch {
        send({ type: "fatal", message: "Анализ прерван из-за внутренней ошибки. Попробуйте ещё раз." });
      }
      finish();
    },
    cancel() {
      inFlight.delete(runKey);
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
