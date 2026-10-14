import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { GAMES } from "@/data/games";
import { DEFAULT_SELECTION } from "@/data/default-build";
import { analyzeBalance } from "@/features/compatibility/balance";
import { checkBuild } from "@/features/compatibility/engine";
import { computeFps, computeFpsByIds } from "@/lib/fps-engine/engine";
import { activeSources, SOURCE_IDS } from "@/lib/fps-engine/sources";
import { dedupeKey, parseCsv, previewImport } from "@/lib/fps-engine/validation";
import { hardwareRepository, resolveBuild } from "@/lib/hardware/repository";
import type { BenchmarkRecord, GameSettings } from "@/types/benchmark";
import type { CpuSpec, GpuSpec } from "@/types/hardware";

// The server store reads its path at import time: point it to a temp file before loading routes.
const STORE_DIR = mkdtempSync(join(tmpdir(), "nexrig-fps-"));
process.env.NEXRIG_BENCHMARK_STORE = join(STORE_DIR, "store.json");
process.env.NEXRIG_BENCHMARK_BACKEND = "file";

const game = GAMES[0];
const cpu = hardwareRepository.byId("amd-ryzen-7-7800x3d") as CpuSpec;
const gpu = hardwareRepository.byId("nvidia-founders-edition-rtx-4070") as GpuSpec;
const settings: GameSettings = { resolution: "1440p", preset: "high", rayTracing: false, upscaling: "off", upscaler: null, frameGen: false };
const SOURCES = new Set(["nexrig", "manufacturer"]);

const record = (patch: Partial<BenchmarkRecord> = {}): BenchmarkRecord => ({
  id: "r1",
  gameId: game.id,
  cpuId: cpu.id,
  gpuId: gpu.id,
  settings,
  avgFps: 97,
  low1Fps: 74,
  source: { kind: "dataset", label: "Тестовый обзор", url: "https://example.com/review" },
  sourceId: "nexrig",
  testDate: "2026-01-15",
  sampleCount: 3,
  verification: "verified",
  ...patch,
});

describe("FPS calculation engine", () => {
  it("uses an exact verified benchmark with its source and date", () => {
    const r = computeFps({ game, cpu, gpu, settings, records: [record()] });
    expect(r.level).toBe("verified");
    expect(r.averageFpsEstimate).toBe(97);
    expect(r.onePercentLow).toBe(74);
    expect(r.sourceUrl).toBe("https://example.com/review");
    expect(r.benchmarkDate).toBe("2026-01-15");
    // A single test: no invented spread around it.
    expect(r.lowFpsEstimate).toBeNull();
    expect(r.highFpsEstimate).toBeNull();
  });

  it("falls back to a labelled model estimate without exact data, rounded to avoid false precision", () => {
    const r = computeFps({ game, cpu, gpu, settings, records: [] });
    expect(r.level).toBe("model");
    expect(r.averageFpsEstimate! % 5).toBe(0);
    expect(r.sourceUrl).toBeNull();
    expect(r.benchmarkDate).toBeNull();
    expect(r.confidence).toBe("low");
  });

  it("calibrates from a close test at another resolution", () => {
    const r = computeFps({ game, cpu, gpu, settings: { ...settings, resolution: "4K" }, records: [record()] });
    expect(r.level).toBe("close");
    expect(r.recordCount).toBe(1);
  });

  it("never transfers a result across presets, ray tracing or frame generation", () => {
    for (const s of [
      { ...settings, preset: "ultra" as const },
      { ...settings, rayTracing: true },
      { ...settings, upscaling: "quality" as const, upscaler: "DLSS" as const, frameGen: true },
    ]) {
      expect(computeFps({ game: GAMES.find((g) => g.supportsRayTracing && g.frameGen.length)!, cpu, gpu, settings: s, records: [record({ gameId: GAMES.find((g) => g.supportsRayTracing && g.frameGen.length)!.id })] }).level).toBe("model");
    }
  });

  it("reports frame generation separately from native FPS", () => {
    const fgGame = GAMES.find((g) => g.frameGen.includes("DLSS-FG"))!;
    const r = computeFps({ game: fgGame, cpu, gpu, settings: { ...settings, upscaling: "quality", upscaler: "DLSS", frameGen: true }, records: [] });
    expect(r.frameGenFps).not.toBeNull();
    expect(r.frameGenFps!).toBeGreaterThan(r.averageFpsEstimate!);
  });

  it("returns no number (null, not 0) for unknown hardware", () => {
    const r = computeFpsByIds({ gameId: game.id, cpuId: "unknown-cpu", gpuId: gpu.id, settings, records: [] });
    expect(r.level).toBe("insufficient");
    expect(r.averageFpsEstimate).toBeNull();
    expect(r.onePercentLow).toBeNull();
    expect(r.confidence).toBeNull();
  });

  it("ignores rejected records", () => {
    const r = computeFps({ game, cpu, gpu, settings, records: [record({ verification: "rejected" })] });
    expect(r.level).toBe("model");
  });
});

describe("data sources", () => {
  it("lists and accepts only sources that actually work", async () => {
    expect(SOURCE_IDS.has("nexrig")).toBe(true);
    expect(SOURCE_IDS.has("3dmark")).toBe(false);
    const store = { kind: "file" as const, ping: async () => undefined, query: async () => [] };
    const sources = activeSources(store);
    expect(sources.map((s) => s.info.id)).toEqual(["nexrig", "manufacturer"]);
    for (const s of sources) expect((await s.getSourceStatus()).status).toBe("active");
  });
});

describe("import validation", () => {
  const header = "game_id,cpu_id,gpu_id,resolution,preset,ray_tracing,avg_fps,low1_fps,source_label,source_url,test_date";
  const row = (fps = "97", low = "74", date = "2026-01-15") => `${game.id},${cpu.id},${gpu.id},1440p,high,false,${fps},${low},Обзор,https://example.com/review,${date}`;
  let n = 0;
  const id = () => `id-${n++}`;

  it("parses CSV with quotes and validates rows", () => {
    expect(parseCsv('a,b\n"x, ""y""",2')[0]).toEqual({ a: 'x, "y"', b: "2" });
    const p = previewImport({ format: "csv", content: [header, row()].join("\n") }, [], SOURCES, id);
    expect(p.valid).toHaveLength(1);
    expect(p.valid[0].record.verification).toBe("unverified");
  });

  it("rejects malformed CSV and JSON", () => {
    expect(() => previewImport({ format: "csv", content: 'a,b\n"open' }, [], SOURCES, id)).toThrow(/кавычки/);
    expect(() => previewImport({ format: "json", content: "{nope" }, [], SOURCES, id)).toThrow(/JSON/);
    expect(() => previewImport({ format: "json", content: '{"a":1}' }, [], SOURCES, id)).toThrow(/массив/);
  });

  it("reports invalid values and unknown references per row", () => {
    const bad = [
      row("50", "80"), // 1% low above average
      row("97", "74", "2999-01-01"), // future date
      `${game.id},no-such-cpu,${gpu.id},1440p,high,false,90,,Обзор,https://example.com,2026-01-01`,
      `${game.id},${cpu.id},${gpu.id},8K,high,false,90,,Обзор,https://example.com,2026-01-01`,
    ];
    const p = previewImport({ format: "csv", content: [header, ...bad].join("\n") }, [], SOURCES, id);
    expect(p.valid).toHaveLength(0);
    expect(p.errors.map((e) => e.row)).toEqual([1, 2, 3, 4]);
    const json = previewImport({ format: "json", content: JSON.stringify([{ ...Object.fromEntries(header.split(",").map((h, i) => [h, row().split(",")[i]])), min_fps: 40 }]) }, [], SOURCES, id);
    expect(json.errors[0].messages.join(" ")).toMatch(/методик/);
  });

  it("detects duplicates within the file and against existing records", () => {
    const content = [header, row(), row()].join("\n");
    const p = previewImport({ format: "csv", content }, [], SOURCES, id);
    expect(p.valid).toHaveLength(1);
    expect(p.duplicates).toHaveLength(1);
    const again = previewImport({ format: "csv", content: [header, row()].join("\n") }, [p.valid[0].record], SOURCES, id);
    expect(again.duplicates).toHaveLength(1);
    expect(dedupeKey(p.valid[0].record)).toContain(game.id);
  });
});

describe("API security", () => {
  let adminRoute: typeof import("@/app/api/admin/benchmarks/route");
  let importRoute: typeof import("@/app/api/admin/benchmarks/import/route");
  let publicRoute: typeof import("@/app/api/fps/benchmarks/route");
  beforeAll(async () => {
    adminRoute = await import("@/app/api/admin/benchmarks/route");
    importRoute = await import("@/app/api/admin/benchmarks/import/route");
    publicRoute = await import("@/app/api/fps/benchmarks/route");
  });
  const TOKEN = "test-admin-token-0123456789abcdef";

  it("keeps admin routes closed when no admin token is configured", async () => {
    delete process.env.NEXRIG_ADMIN_TOKEN;
    const res = await adminRoute.GET(new Request("http://x/api/admin/benchmarks"));
    expect(res.status).toBe(503);
  });

  it("rejects unauthorised and wrong-token requests", async () => {
    process.env.NEXRIG_ADMIN_TOKEN = TOKEN;
    expect((await adminRoute.GET(new Request("http://x/api/admin/benchmarks"))).status).toBe(401);
    const wrong = new Request("http://x/api/admin/benchmarks/import", { method: "POST", headers: { Authorization: "Bearer wrong" }, body: "{}" });
    expect((await importRoute.POST(wrong)).status).toBe(401);
  });

  it("imports as admin, and the public API never exposes unverified records", async () => {
    process.env.NEXRIG_ADMIN_TOKEN = TOKEN;
    const header = "game_id,cpu_id,gpu_id,resolution,preset,ray_tracing,avg_fps,source_label,source_url,test_date";
    const content = `${header}\n${game.id},${cpu.id},${gpu.id},1440p,high,false,97,Обзор,https://example.com/a,2026-01-15`;
    const req = (mode: string) =>
      new Request("http://x/api/admin/benchmarks/import", { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ format: "csv", content, mode }) });
    const preview = await (await importRoute.POST(req("preview"))).json();
    expect(preview.valid).toBe(1);
    const commit = await importRoute.POST(req("commit"));
    expect(commit.status).toBe(201);
    const pub = await (await publicRoute.GET(new Request(`http://x/api/fps/benchmarks?gpuId=${gpu.id}&verification=unverified`))).json();
    expect(pub.total).toBe(0);
    // Oversized payloads are refused before parsing.
    const huge = new Request("http://x/api/admin/benchmarks/import", { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "content-length": "5000000" }, body: "{}" });
    expect((await importRoute.POST(huge)).status).toBe(413);
  });
});

describe("community measurements", () => {
  it("refuses submissions without a signed-in user", async () => {
    const { POST } = await import("@/app/api/fps/submissions/route");
    const res = await POST(new Request("http://x/api/fps/submissions", { method: "POST", headers: { origin: "http://x", host: "x" }, body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("stores one submission per test, filters by author and hides the author publicly", async () => {
    const { getBenchmarkStore } = await import("@/lib/fps-engine/store");
    const store = getBenchmarkStore();
    const sub = record({ id: "s1", testDate: "2026-02-02", submittedBy: "user-a", verification: "unverified", source: { kind: "user", label: "Замер пользователя NexRig" } });
    expect(await store.insertSubmission(sub)).toBe(true);
    expect(await store.insertSubmission({ ...sub, id: "s2" })).toBe(false);
    expect((await store.list({ submittedBy: "user-a", verification: "any" })).total).toBe(1);
    expect((await store.list({ submittedBy: "user-b", verification: "any" })).total).toBe(0);

    const { GET } = await import("@/app/api/fps/benchmarks/route");
    const before = await (await GET(new Request(`http://x/api/fps/benchmarks?gpuId=${gpu.id}`))).json();
    expect(before.items.some((r: { id: string }) => r.id === "s1")).toBe(false); // not verified yet
    await store.update("s1", { verification: "verified" });
    const after = await (await GET(new Request(`http://x/api/fps/benchmarks?gpuId=${gpu.id}`))).json();
    const item = after.items.find((r: { id: string }) => r.id === "s1");
    expect(item.community).toBe(true);
    expect(item).not.toHaveProperty("submittedBy");
  });
});

describe("build balance", () => {
  it("flags an old quad-core with DDR3 driving an RTX 5080", () => {
    const sel = {
      ...DEFAULT_SELECTION,
      cpu: "intel-core-i5-7400",
      motherboard: "gigabyte-ga-b150m-d3h-ddr3",
      ram: "kingston-hyperx-fury-ddr3-8gb-1600-cl10",
      gpu: "nvidia-founders-edition-rtx-5080",
    };
    const report = analyzeBalance(resolveBuild(sel));
    const pair = report.items.find((i) => i.id === "cpu-gpu")!;
    expect(pair.status).toBe("poor");
    expect(pair.limiter).toBe("cpu");
    expect(pair.scorePct!).toBeLessThan(50);
    expect(report.items.find((i) => i.id === "ram")!.status).not.toBe("good");
    const checks = checkBuild(sel).checks;
    expect(checks.find((c) => c.rule === "balance-cpu-gpu")?.status).toBe("warning");
    expect(checks.find((c) => c.rule === "balance-ram")?.status).toBe("warning");
  });

  it("does not warn about a matched pair", () => {
    const sel = { ...DEFAULT_SELECTION, cpu: "amd-ryzen-7-9800x3d", motherboard: "msi-mag-x870-tomahawk-wifi", gpu: "nvidia-founders-edition-rtx-5070" };
    expect(checkBuild(sel).checks.find((c) => c.rule === "balance-cpu-gpu")?.status).toBe("compatible");
  });
});
