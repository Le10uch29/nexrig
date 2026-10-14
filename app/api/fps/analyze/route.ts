import { randomUUID } from "node:crypto";
import { GAMES } from "@/data/games";
import { analyzeBuild, ANALYSIS_RESOLUTIONS, reconcile, selectCandidates, transferCandidates, type AnalysisReport, type AnalysisTarget } from "@/lib/fps-engine/analysis";
import { fingerprint, type AnalysisEvent, type StageId } from "@/lib/fps-engine/analysis-stages";
import { badRequest } from "@/lib/fps-engine/api-schemas";
import { analyzeSchema } from "@/lib/fps-engine/analyze-schema";
import { disabledSourceIds } from "@/lib/fps-engine/source-registry";
import { getBenchmarkStore, StoreError, type BenchmarkFilter } from "@/lib/fps-engine/store";
import { memoryOf } from "@/lib/benchmark-engine/estimate";
import { hardwareRepository } from "@/lib/hardware/repository";
import { readLimitedText } from "@/lib/server/admin-auth";
import type { BenchmarkRecord } from "@/types/benchmark";

/**
 * "Протестировать ПК": runs the multi-source analysis and streams progress as NDJSON — one
 * AnalysisEvent per line. Each stage is a real step (store queries, matching, transfer,
 * reconciliation); a failing stage is reported as "error" and the run continues with what it has.
 * The client cancels by aborting the request.
 *
 * Results are cached per configuration for CACHE_TTL_MS in this server instance; a cached result
 * is marked as such with its date, and `force: true` runs the analysis again.
 */
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 100;
const cache = new Map<string, { report: AnalysisReport; warnings: string[]; at: number }>();

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
  const games = q.gameIds ? GAMES.filter((g) => q.gameIds!.includes(g.id)) : GAMES;
  if (!games.length) return Response.json({ error: "Не выбрано ни одной известной игры." }, { status: 422 });

  const target: AnalysisTarget = {
    cpu,
    gpu,
    memory: q.ram ? memoryOf({ type: q.ram.type, speedMtps: q.ram.speedMtps }, q.ram.modules) : undefined,
    ramGb: q.ram?.moduleGb ? q.ram.moduleGb * q.ram.modules : undefined,
    settings: q.settings,
  };
  const configKey = fingerprint({ cpu: cpu.id, gpu: gpu.id, ram: q.ram ?? null, settings: q.settings, games: games.map((g) => g.id) });
  const buildVersion = q.buildVersion ?? configKey;
  const signal = request.signal;
  const encoder = new TextEncoder();

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
        const hit = cache.get(configKey);
        if (hit && !q.force && Date.now() - hit.at < CACHE_TTL_MS) {
          const cachedAt = new Date(hit.at).toISOString();
          send({ type: "start", runId: randomUUID(), buildVersion, configKey, cached: true, cachedAt });
          stage("freeze", "done", `Конфигурация ${configKey}.`);
          for (const id of ["sources", "exact", "gpu", "cpu", "similar", "normalize", "transfer", "reconcile"] as const) stage(id, "done", "Из кэша.");
          stage("report", "done", `Результат из кэша от ${cachedAt}.`);
          send({ type: "result", report: hit.report, cached: true, cachedAt, warnings: hit.warnings });
          return finish();
        }

        send({ type: "start", runId: randomUUID(), buildVersion, configKey, cached: false, cachedAt: null });
        const warnings: string[] = [];

        // 1. Freeze: the request body is the frozen configuration; its key identifies the run.
        stage("freeze", "running");
        stage("freeze", "done", `${cpu.name} + ${gpu.name}${target.memory ? `, ${target.memory.type} ${target.memory.speedMtps} МТ/с × ${target.memory.modules}` : ""}. Конфигурация ${configKey}.`);
        if (aborted()) return finish();

        const store = getBenchmarkStore();

        // 2. Sources: store reachable, which sources are switched off.
        stage("sources", "running");
        let disabled = new Set<string>();
        try {
          await store.ping();
          disabled = await disabledSourceIds(store);
          stage("sources", "done", disabled.size ? `Отключены администратором: ${[...disabled].join(", ")}.` : "База замеров доступна.");
        } catch (e) {
          const msg = safeMessage(e);
          warnings.push(`Источники: ${msg}`);
          stage("sources", "error", msg);
        }
        if (aborted()) return finish();

        // 3–6. Queries; each one may fail on its own.
        const byId = new Map<string, BenchmarkRecord>();
        const lookup = async (id: StageId, filter: BenchmarkFilter, describe: (n: number) => string) => {
          stage(id, "running");
          try {
            const found = await store.query({ ...filter, verification: "verified" });
            for (const r of found) byId.set(r.id, r);
            stage(id, found.length ? "done" : "empty", describe(found.length));
            return found.length;
          } catch (e) {
            const msg = safeMessage(e);
            warnings.push(`${msg}`);
            stage(id, "error", msg);
            return 0;
          }
        };
        await lookup("exact", { cpuId: cpu.id, gpuId: gpu.id }, (n) => (n ? `Найдено замеров этой пары CPU + GPU: ${n}.` : "Замеров именно этой пары CPU + GPU нет."));
        if (aborted()) return finish();
        await lookup("gpu", { gpuId: gpu.id }, (n) => (n ? `Тестов ${gpu.name}: ${n}.` : `Тестов ${gpu.name} нет.`));
        if (aborted()) return finish();
        await lookup("cpu", { cpuId: cpu.id }, (n) => (n ? `Тестов ${cpu.name}: ${n}.` : `Тестов ${cpu.name} нет.`));
        if (aborted()) return finish();
        stage("similar", "running");
        let similarFailed = 0;
        let similarFound = 0;
        for (const g of games) {
          if (aborted()) return finish();
          try {
            const found = await store.query({ gameId: g.id, verification: "verified" });
            similarFound += found.length;
            for (const r of found) byId.set(r.id, r);
          } catch (e) {
            similarFailed++;
            if (similarFailed === 1) warnings.push(safeMessage(e));
          }
        }
        stage(
          "similar",
          similarFailed === games.length ? "error" : similarFound ? "done" : "empty",
          similarFailed === games.length ? "Не удалось получить тесты игр." : `Проверенных тестов по ${games.length} играм: ${similarFound}${similarFailed ? ` (не загружено игр: ${similarFailed})` : ""}.`,
        );
        if (aborted()) return finish();

        const records = [...byId.values()];
        const pairs = games.flatMap((g) => ANALYSIS_RESOLUTIONS.map((res) => ({ g, res })));

        // 7. Methodology: comparable records per game × resolution.
        stage("normalize", "running");
        const sets = pairs.map(({ g, res }) => ({ g, res, set: selectCandidates(target, g, res, records, disabled) }));
        const comparable = sets.reduce((n, s) => n + s.set.candidates.length, 0);
        const excludedFg = sets.reduce((n, s) => n + (s.set.excluded["генерация кадров (FG) не смешивается с обычным FPS"] ?? 0), 0);
        stage("normalize", records.length ? (comparable ? "done" : "empty") : "empty", records.length ? `Сопоставимых пар «тест → разрешение»: ${comparable}${excludedFg ? `; с генерацией кадров отдельно: ${excludedFg}` : ""}.` : "Тестов для сопоставления нет.");
        if (aborted()) return finish();

        // 8. Transfer to the target build.
        stage("transfer", "running");
        const moved = sets.map((s) => ({ ...s, t: transferCandidates(target, s.g, s.res, s.set.candidates) }));
        const ok = moved.reduce((n, m) => n + m.t.filter((x) => !x.refused).length, 0);
        const refused = moved.reduce((n, m) => n + m.t.filter((x) => x.refused).length, 0);
        stage("transfer", ok ? "done" : "empty", ok ? `Перенесено: ${ok}${refused ? `, отказано (слишком разные системы): ${refused}` : ""}.` : "Переносить нечего.");
        if (aborted()) return finish();

        // 9. Outliers and agreement.
        stage("reconcile", "running");
        const rec = moved.map((m) => reconcile(m.t));
        const outliers = rec.reduce((n, r) => n + r.rejected.filter((x) => x.reason.startsWith("выброс")).length, 0);
        const contradictions = rec.filter((r) => r.contradictory).length;
        stage("reconcile", ok ? "done" : "empty", ok ? `Выбросов исключено: ${outliers}; противоречивых результатов: ${contradictions}.` : "Нет данных для проверки.");
        if (aborted()) return finish();

        // 10. Result.
        stage("report", "running");
        const report = analyzeBuild({ target, games, records, disabledSources: disabled });
        stage("report", "done", `Игр: ${games.length}; тест — ${report.counts.verified}, перенос — ${report.counts.close}, модель — ${report.counts.model}, нет данных — ${report.counts.insufficient}.`);
        if (warnings.length) report.limitations.unshift("Часть источников была недоступна — результат рассчитан по тем данным, что удалось получить.");
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
        // Partial runs are not cached: a retry should try the failed sources again.
        if (!warnings.length) cache.set(configKey, { report, warnings, at: Date.now() });
        send({ type: "result", report, cached: false, cachedAt: null, warnings });
      } catch {
        send({ type: "fatal", message: "Анализ прерван из-за внутренней ошибки. Попробуйте ещё раз." });
      }
      finish();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
