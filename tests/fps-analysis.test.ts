import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GAMES } from "@/data/games";
import { analyzeBuild, analyzeResolution, selectCandidates, transferCandidates, type AnalysisTarget } from "@/lib/fps-engine/analysis";
import { fingerprint, type AnalysisEvent } from "@/lib/fps-engine/analysis-stages";
import { allowedSourceUrl, catalogEntry } from "@/lib/fps-engine/catalog";
import { hardwareRepository } from "@/lib/hardware/repository";
import type { BenchmarkRecord, GameSettings } from "@/types/benchmark";
import type { CpuSpec, GpuSpec } from "@/types/hardware";

const STORE_DIR = mkdtempSync(join(tmpdir(), "nexrig-analysis-"));
process.env.NEXRIG_BENCHMARK_STORE = join(STORE_DIR, "store.json");
process.env.NEXRIG_BENCHMARK_BACKEND = "file";

const game = GAMES[0];
const cpu = hardwareRepository.byId("amd-ryzen-7-7800x3d") as CpuSpec;
const gpu = hardwareRepository.byId("nvidia-founders-edition-rtx-4070") as GpuSpec;
const otherCpu = hardwareRepository.byId("amd-ryzen-7-9800x3d") as CpuSpec;
const otherGpu = hardwareRepository.byId("nvidia-founders-edition-rtx-3070") as GpuSpec;
const base: Omit<GameSettings, "resolution"> = { preset: "high", rayTracing: false, upscaling: "off", upscaler: null, frameGen: false };
const target: AnalysisTarget = { cpu, gpu, memory: { type: "DDR5", speedMtps: 6000, modules: 2 }, ramGb: 32, settings: base };

let n = 0;
const record = (patch: Partial<BenchmarkRecord> = {}): BenchmarkRecord => ({
  id: `a${++n}`,
  gameId: game.id,
  cpuId: cpu.id,
  gpuId: gpu.id,
  settings: { ...base, resolution: "1440p" },
  avgFps: 97,
  low1Fps: 74,
  source: { kind: "dataset", label: "Тестовый обзор", url: `https://example.com/review-${n}` },
  sourceId: "nexrig",
  testDate: "2026-01-15",
  sampleCount: 3,
  verification: "verified",
  ...patch,
});

describe("multi-source analysis: matching tiers", () => {
  it("uses an exact match as a real test, without inventing a spread", () => {
    const r = analyzeResolution(target, game, "1440p", [record()]);
    expect(r.level).toBe("verified");
    expect(r.tier).toBe(1);
    expect(r.avg).toEqual({ low: 97, mid: 97, high: 97 });
    expect(r.low1?.mid).toBe(74);
    expect(r.tests[0].used).toBe(true);
    expect(r.tests[0].transfer.factor).toBe(1);
    expect(r.log.length).toBeGreaterThan(0);
  });

  it("transfers a same-GPU test from another CPU through the model ratio and logs it", () => {
    const r = analyzeResolution(target, game, "1440p", [record({ cpuId: otherCpu.id, avgFps: 100 })]);
    expect(r.level).toBe("close");
    expect(r.tier).toBe(2);
    const t = r.tests[0];
    expect(t.differences.some((d) => d.startsWith("Процессор"))).toBe(true);
    expect(t.matched).toContain("Видеокарта");
    expect(t.transfer.method).toMatch(/модель для вашей системы/);
    expect(t.transferred.avg).toBe(Math.round(100 * t.transfer.factor));
    expect(r.log.some((l) => l.includes("×"))).toBe(true);
    expect(r.avg!.low).toBeLessThan(r.avg!.high);
  });

  it("uses a GPU within ±30% as tier 4 and ignores farther GPUs", () => {
    const closeGpu = Math.abs(otherGpu.rasterIndex / gpu.rasterIndex - 1) <= 0.3;
    const r = analyzeResolution(target, game, "1440p", [record({ gpuId: otherGpu.id, avgFps: 80 })]);
    if (closeGpu) {
      expect(r.tier).toBe(4);
      expect(r.provenance).toBe("estimated");
      expect(r.tests[0].differences.some((d) => d.startsWith("Видеокарта"))).toBe(true);
    } else expect(r.level).toBe("model");
    const far = analyzeResolution(target, game, "1440p", [record({ gpuId: "asus-rog-strix-rtx-4090", avgFps: 200 })]);
    expect(far.level).toBe("model");
  });

  it("uses the same GPU in another game (same preset) or another preset (same game) as tier 3", () => {
    const other = GAMES.find((g) => g.id !== game.id)!;
    const r1 = analyzeResolution(target, game, "1440p", [record({ gameId: other.id, avgFps: 150 })]);
    expect(r1.tier).toBe(3);
    expect(r1.tests[0].differences.some((d) => d.startsWith("Игра"))).toBe(true);
    expect(r1.tests[0].transfer.method).toContain("→");
    const r2 = analyzeResolution(target, game, "1440p", [record({ settings: { ...base, resolution: "1440p", preset: "ultra" }, avgFps: 80 })]);
    expect(r2.tier).toBe(3);
    expect(r2.tests[0].differences.some((d) => d.startsWith("Пресет"))).toBe(true);
    // Another game AND another preset is too far.
    const r3 = analyzeResolution(target, game, "1440p", [record({ gameId: other.id, settings: { ...base, resolution: "1440p", preset: "ultra" } })]);
    expect(r3.level).toBe("model");
  });

  it("prefers the closest tier and keeps farther tiers out of the result", () => {
    const r = analyzeResolution(target, game, "1440p", [record({ avgFps: 97 }), record({ cpuId: otherCpu.id, gpuId: otherGpu.id, avgFps: 50 })]);
    expect(r.tier).toBe(1);
    const far = r.tests.find((t) => t.tier > 2);
    expect(far?.used).toBe(false);
  });

  it("never mixes frame-generation results with ordinary FPS", () => {
    const r = analyzeResolution(target, game, "1440p", [record({ settings: { ...base, resolution: "1440p", frameGen: true }, avgFps: 160 })]);
    expect(r.level).toBe("model");
    expect(r.log.some((l) => l.includes("FG"))).toBe(true);
    const fg = analyzeResolution({ ...target, settings: { ...base, frameGen: true } }, game, "1440p", [record({ settings: { ...base, resolution: "1440p", frameGen: true }, avgFps: 160 })]);
    expect(fg.level).toBe("verified");
    expect(fg.frameGen).toBe(true);
  });

  it("does not transfer across RT or upscaling", () => {
    expect(analyzeResolution(target, game, "1440p", [record({ settings: { ...base, resolution: "1440p", rayTracing: true } })]).level).toBe("model");
    expect(analyzeResolution(target, game, "1440p", [record({ settings: { ...base, resolution: "1440p", upscaling: "quality", upscaler: "DLSS" } })]).level).toBe("model");
  });

  it("labels every value as measured, estimated or modeled", () => {
    expect(analyzeResolution(target, game, "1440p", [record()]).provenance).toBe("measured");
    expect(analyzeResolution(target, game, "1440p", [record({ cpuId: otherCpu.id })]).provenance).toBe("estimated");
    expect(analyzeResolution(target, game, "1440p", []).provenance).toBe("modeled");
    // A mix of exact and transferred tests is not presented as a pure measurement.
    expect(analyzeResolution(target, game, "1440p", [record(), record({ cpuId: otherCpu.id })]).provenance).toBe("estimated");
  });

  it("down-weights stale tests and lowers confidence when all tests are stale", () => {
    const now = new Date("2026-10-15");
    const fresh = analyzeResolution(target, game, "1440p", [record({ cpuId: otherCpu.id, testDate: "2026-06-01" }), record({ cpuId: otherCpu.id, testDate: "2026-05-01", avgFps: 99 })], undefined, now);
    const old = analyzeResolution(target, game, "1440p", [record({ cpuId: otherCpu.id, testDate: "2021-06-01" }), record({ cpuId: otherCpu.id, testDate: "2021-05-01", avgFps: 99 })], undefined, now);
    expect(old.tests.every((t) => t.stale)).toBe(true);
    expect(old.tests[0].differences.some((d) => d.includes("старше"))).toBe(true);
    expect(old.tests[0].uncertainty).toBeGreaterThan(fresh.tests[0].uncertainty);
    expect(old.confidence).toBe("low");
    expect(fresh.confidence).toBe("medium");
    // Fresh and stale conflicting: the fresher test weighs more.
    const mixed = analyzeResolution(target, game, "1440p", [record({ cpuId: otherCpu.id, testDate: "2026-06-01", avgFps: 100 }), record({ cpuId: otherCpu.id, testDate: "2019-01-01", avgFps: 150 })], undefined, now);
    const near = (v: number, x: number) => Math.abs(v - x) / x;
    expect(near(mixed.avg!.mid, mixed.tests.find((t) => !t.stale)!.transferred.avg)).toBeLessThan(near(mixed.avg!.mid, mixed.tests.find((t) => t.stale)!.transferred.avg));
  });

  it("computes presets, RT and frame generation separately", () => {
    const r = analyzeBuild({ target, games: [game], records: [record()] }).games[0].results[1];
    expect(r.variants!.presets.map((p) => p.preset)).toEqual(["low", "medium", "high", "ultra"]);
    expect(r.variants!.presets.find((p) => p.preset === "high")!.provenance).toBe("measured");
    expect(r.variants!.presets.find((p) => p.preset === "low")!.provenance).not.toBe("measured");
    if (r.variants!.frameGen) expect(r.variants!.frameGen.provenance).toBe("modeled");
  });

  it("removes outliers and reports them", () => {
    const recs = [100, 104, 98, 250].map((avgFps) => record({ cpuId: otherCpu.id, avgFps }));
    const r = analyzeResolution(target, game, "1440p", recs);
    const out = r.tests.find((t) => t.measured.avg === 250);
    expect(out?.used).toBe(false);
    expect(out?.excludedReason).toMatch(/выброс/);
    expect(r.tests.filter((t) => t.used)).toHaveLength(3);
  });

  it("falls back to the model when tests contradict each other", () => {
    const r = analyzeResolution(target, game, "1440p", [record({ cpuId: otherCpu.id, avgFps: 50 }), record({ cpuId: otherCpu.id, avgFps: 180 })]);
    expect(r.level).toBe("model");
    expect(r.reasons[0]).toMatch(/противоречат/);
  });

  it("widens the range and lowers confidence when tests disagree moderately", () => {
    const agree = analyzeResolution(target, game, "1440p", [record({ cpuId: otherCpu.id, avgFps: 100 }), record({ cpuId: otherCpu.id, avgFps: 102 })]);
    const disagree = analyzeResolution(target, game, "1440p", [record({ cpuId: otherCpu.id, avgFps: 80 }), record({ cpuId: otherCpu.id, avgFps: 120 })]);
    expect(disagree.avg!.high - disagree.avg!.low).toBeGreaterThan(agree.avg!.high - agree.avg!.low);
    expect(disagree.confidence).toBe("low");
  });

  it("gives no 1% low from the model and no number without data or model parameters", () => {
    const m = analyzeResolution(target, game, "1440p", []);
    expect(m.level).toBe("model");
    expect(m.low1).toBeNull();
    const none = analyzeResolution({ ...target, cpu: { ...cpu, gamingIndex: 0 } }, game, "1440p", []);
    expect(none.level).toBe("insufficient");
    expect(none.avg).toBeNull();
  });

  it("skips records of disabled sources", () => {
    const r = analyzeResolution(target, game, "1440p", [record({ sourceId: "tomshardware" })], new Set(["tomshardware"]));
    expect(r.level).toBe("model");
    expect(r.log.some((l) => l.includes("отключён"))).toBe(true);
  });

  it("refuses transfers between systems that are too different", () => {
    const weak = hardwareRepository.byId("intel-core-i3-2100") as CpuSpec;
    const { candidates } = selectCandidates({ ...target, cpu: weak }, game, "1080p", [record({ settings: { ...base, resolution: "1080p" }, avgFps: 140 })]);
    const [t] = transferCandidates({ ...target, cpu: weak }, game, "1080p", candidates);
    const outOfRange = t.factor > 3 || t.factor < 1 / 3;
    expect(Boolean(t.refused)).toBe(outOfRange);
  });

  it("reports every game at 1080p, 1440p and 4K with similar systems and sources", () => {
    const report = analyzeBuild({ target, games: GAMES, records: [record(), record({ cpuId: otherCpu.id, settings: { ...base, resolution: "4K" }, avgFps: 50 })] });
    expect(report.games).toHaveLength(GAMES.length);
    for (const g of report.games) expect(g.results.map((r) => r.resolution)).toEqual(["1080p", "1440p", "4K"]);
    const total = Object.values(report.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(GAMES.length * 3);
    expect(report.similarSystems.length).toBeGreaterThan(0);
    expect(report.sourcesUsed[0].label).toBe("Тестовый обзор");
  });
});

describe("source catalogue", () => {
  it("allows admin URLs only on the source's own domain over https", () => {
    const t = catalogEntry("tomshardware")!;
    expect(allowedSourceUrl(t, "https://www.tomshardware.com/x")).toBe(true);
    expect(allowedSourceUrl(t, "http://www.tomshardware.com/x")).toBe(false);
    expect(allowedSourceUrl(t, "https://evil.example/tomshardware.com")).toBe(false);
    expect(allowedSourceUrl(t, "https://169.254.169.254/")).toBe(false);
  });

  it("is stable in its fingerprint", () => {
    expect(fingerprint({ a: 1 })).toBe(fingerprint({ a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
});

describe("source registry (file store)", () => {
  it("never shows a manual source as active without data; disabling removes its records from calculations", async () => {
    const { getBenchmarkStore, recordsForCalculation } = await import("@/lib/fps-engine/store");
    const { sourceOverview, updateSource } = await import("@/lib/fps-engine/source-registry");
    const store = getBenchmarkStore();
    let o = await sourceOverview(store);
    expect(o.items.find((s) => s.audit.id === "tomshardware")?.status).toBe("no-data");
    expect(o.items.find((s) => s.audit.id === "3dmark")?.status).toBe("not-used");

    await store.insertBatch([record({ id: "th1", sourceId: "tomshardware" })], { id: "b-th", sourceId: "tomshardware", createdAt: new Date().toISOString(), rowCount: 1, status: "committed" });
    await store.update("th1", { verification: "verified" });
    o = await sourceOverview(store);
    expect(o.items.find((s) => s.audit.id === "tomshardware")).toMatchObject({ status: "active", usableRecords: 1 });

    expect((await updateSource(store, "tomshardware", { baseUrl: "https://evil.example/" })).ok).toBe(false);
    expect((await updateSource(store, "nexrig", { enabled: false })).ok).toBe(false);
    expect((await updateSource(store, "tomshardware", { enabled: false })).ok).toBe(true);
    o = await sourceOverview(store);
    expect(o.items.find((s) => s.audit.id === "tomshardware")?.status).toBe("disabled");
    const { records } = await recordsForCalculation({ gameId: game.id });
    expect(records.some((r) => r.sourceId === "tomshardware")).toBe(false);
    await updateSource(store, "tomshardware", { enabled: true });
  });

  it("checks a source with one request and records failures without secrets", async () => {
    const { getBenchmarkStore } = await import("@/lib/fps-engine/store");
    const { checkSource, sourceOverview } = await import("@/lib/fps-engine/source-registry");
    const store = getBenchmarkStore();
    const calls: string[] = [];
    const ok = (async (url: string) => {
      calls.push(url);
      return new Response("<rss/>", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await checkSource(store, "techspot", ok)).toMatchObject({ ok: true });
    expect(calls).toEqual(["https://www.techspot.com/backend.xml"]);
    let s = (await sourceOverview(store)).items.find((x) => x.audit.id === "techspot")!;
    expect(s.lastCheckAt).not.toBeNull();
    expect(s.status).toBe("no-data");

    const fail = (async () => {
      throw new Error("ECONNREFUSED secret-host");
    }) as unknown as typeof fetch;
    expect(await checkSource(store, "techspot", fail)).toMatchObject({ ok: false });
    s = (await sourceOverview(store)).items.find((x) => x.audit.id === "techspot")!;
    expect(s.status).toBe("error");
    expect(s.errorMessage).not.toMatch(/secret/);

    const redirected = (async () => Object.defineProperty(new Response("", { status: 200 }), "url", { value: "https://elsewhere.example/" })) as unknown as typeof fetch;
    expect(await checkSource(store, "gamersnexus", redirected)).toMatchObject({ ok: false });
  });

  it("lists external sources publicly only when they have usable records", async () => {
    const { getBenchmarkStore } = await import("@/lib/fps-engine/store");
    const { publicSources } = await import("@/lib/fps-engine/source-registry");
    const ids = (await publicSources(getBenchmarkStore())).items.map((i) => i.id);
    expect(ids).toContain("tomshardware"); // has a verified record (previous test)
    expect(ids).not.toContain("techspot");
    expect(ids).not.toContain("3dmark");
  });
});

describe("POST /api/fps/analyze", () => {
  const body = { cpuId: cpu.id, gpuId: gpu.id, settings: base, gameIds: [game.id] };
  const run = async (b: object) => {
    const { POST } = await import("@/app/api/fps/analyze/route");
    const res = await POST(new Request("http://x/api/fps/analyze", { method: "POST", body: JSON.stringify(b) }));
    expect(res.headers.get("content-type")).toMatch(/ndjson/);
    return (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as AnalysisEvent);
  };

  it("drops the cached result when an existing record is edited or deleted (fix 7)", async () => {
    const { getBenchmarkStore } = await import("@/lib/fps-engine/store");
    const store = getBenchmarkStore();
    const other = GAMES[1];
    const b = { cpuId: cpu.id, gpuId: gpu.id, settings: base, gameIds: [other.id] };
    await store.insertBatch([record({ id: "cache-1", gameId: other.id, verification: "unverified" })], { id: "b-cache", sourceId: "nexrig", createdAt: new Date().toISOString(), rowCount: 1, status: "committed" });
    await store.update("cache-1", { verification: "verified" });
    const resultOf = (ev: AnalysisEvent[]) => ev.find((e) => e.type === "result") as Extract<AnalysisEvent, { type: "result" }>;

    const first = resultOf(await run(b));
    expect(first.cached).toBe(false);
    expect(first.report.games[0].results[1].avg?.mid).toBe(97);
    expect(resultOf(await run(b)).cached).toBe(true); // nothing changed

    // Same number of records, different value: must not be served from the cache.
    await new Promise((r) => setTimeout(r, 5));
    await store.update("cache-1", { avgFps: 120 });
    const edited = resultOf(await run(b));
    expect(edited.cached).toBe(false);
    expect(edited.report.games[0].results[1].avg?.mid).toBe(120);

    await store.remove("cache-1");
    const removed = resultOf(await run(b));
    expect(removed.cached).toBe(false);
    expect(removed.report.games[0].results[1].tests.some((t) => t.recordId === "cache-1")).toBe(false);
    expect(removed.report.games[0].results[1].level).not.toBe("verified");
  });

  it("streams all ten stages and a report, then serves the cache with its date", async () => {
    const events = await run(body);
    expect(events[0]).toMatchObject({ type: "start", cached: false });
    const finished = new Set(events.filter((e) => e.type === "stage" && e.status !== "running").map((e) => (e as { id: string }).id));
    expect(finished.size).toBe(8);
    const result = events.find((e) => e.type === "result");
    expect(result && result.type === "result" && result.report.games[0].results).toHaveLength(3);

    const again = await run(body);
    const cached = again.find((e) => e.type === "result");
    expect(cached).toMatchObject({ cached: true });
    expect(cached && cached.type === "result" && cached.cachedAt).toBeTruthy();

    const forced = await run({ ...body, force: true });
    expect(forced.find((e) => e.type === "result")).toMatchObject({ cached: false });
  });

  it("rejects unknown parts and bad input", async () => {
    const { POST } = await import("@/app/api/fps/analyze/route");
    expect((await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ ...body, cpuId: "nope" }) }))).status).toBe(422);
    expect((await POST(new Request("http://x", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ cpuId: cpu.id }) }))).status).toBe(400);
  });

  it("requires an admin for source management", async () => {
    const { GET } = await import("@/app/api/admin/sources/route");
    const res = await GET(new Request("http://x/api/admin/sources"));
    expect([401, 503]).toContain(res.status);
  });
});

describe("FPS Lab: verified vs own data (fix 5)", () => {
  it("never feeds the user's own unverified records into the calculation", async () => {
    const { splitLabRecords } = await import("@/features/benchmarks/records");
    const { computeFps } = await import("@/lib/fps-engine/engine");
    const own = [{ ...record({ id: "own-1" }), verification: undefined, source: { kind: "user" as const, label: "Мой замер" } }];
    const split = splitLabRecords(own, [], { gameId: game.id, cpuId: cpu.id, gpuId: gpu.id, settings: { resolution: "1440p" } });
    expect(split.forCalculation).toHaveLength(0);
    expect(split.ownMatching).toHaveLength(1);
    const r = computeFps({ game, cpu, gpu, settings: { ...base, resolution: "1440p" }, records: split.forCalculation });
    expect(r.level).toBe("model"); // not "Подтверждённый тест"
    // Unverified server rows (should never arrive) are dropped as well.
    expect(splitLabRecords([], [record({ verification: "unverified" })], { gameId: game.id, settings: { resolution: "1440p" } }).forCalculation).toHaveLength(0);
  });

  it("links every source a value is based on", async () => {
    const { computeFps } = await import("@/lib/fps-engine/engine");
    const s = { ...base, resolution: "1440p" as const };
    const measured = computeFps({ game, cpu, gpu, settings: s, records: [record({ id: "s1", testDate: "2026-02-01" }), record({ id: "s2", testDate: "2026-03-01", source: { kind: "dataset", label: "Второй обзор", url: "https://example.org/b" } })] });
    expect(measured.level).toBe("verified");
    expect(measured.sources.map((x) => x.label)).toEqual(["Второй обзор", "Тестовый обзор"]);
    expect(measured.sources.every((x) => x.url)).toBe(true);
    const calibrated = computeFps({ game, cpu, gpu, settings: s, records: [record({ id: "s3", cpuId: otherCpu.id, settings: { ...base, resolution: "1080p" } })] });
    expect(calibrated.level).toBe("close");
    expect(calibrated.sources).toHaveLength(1);
    expect(calibrated.sources[0].url).toMatch(/^https:\/\/example\.com\//);
    expect(computeFps({ game, cpu, gpu, settings: s, records: [] }).sources).toEqual([]);
  });
});
