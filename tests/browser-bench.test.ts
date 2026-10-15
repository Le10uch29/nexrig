import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chooseBackend, describeAgent, isSoftwareRenderer, type BackendInfo } from "@/lib/browser-bench/capabilities";
import { BENCH_MODES, BENCH_PRESETS, BENCH_VERSION } from "@/lib/browser-bench/config";
import { BenchAborted, runBenchmark, type BenchRenderer } from "@/lib/browser-bench/runner";
import { assess, summarize, type FrameStats } from "@/lib/browser-bench/stats";
import { checkSubmission, type Submission } from "@/lib/browser-bench/submission";
import { requireAdmin } from "@/lib/server/admin-auth";
import { createRateLimiter } from "@/lib/server/rate-limit";

const STORE_DIR = mkdtempSync(join(tmpdir(), "nexrig-bench-"));
process.env.NEXRIG_BENCHMARK_STORE = join(STORE_DIR, "store.json");
process.env.NEXRIG_BENCHMARK_BACKEND = "file";

/**
 * A fake GPU on a fake clock. `resolutionMs` models the browser's coarse performance.now();
 * `yieldMs` is the pause between batches (event loop, preview).
 */
function fakeRig(frameMs: (i: number) => number, opts: { resolutionMs?: number; yieldMs?: number; hiddenAfterMs?: number; pauseAtMs?: number } = {}) {
  let t = 0;
  let paused = false;
  const res = opts.resolutionMs ?? 0;
  const renderer: BenchRenderer = {
    frame(i) {
      t += frameMs(i);
    },
    async sync() {},
  };
  return {
    renderer,
    now: () => (res ? Math.floor(t / res) * res : t),
    yieldFn: async () => {
      t += opts.yieldMs ?? 0;
      if (opts.pauseAtMs !== undefined && !paused && t > opts.pauseAtMs) {
        paused = true;
        t += 5_000; // the browser suspended the page
      }
    },
    isHidden: () => opts.hiddenAfterMs !== undefined && t > opts.hiddenAfterMs,
  };
}

const allFinite = (s: FrameStats) => Object.values(s).every((v) => (typeof v === "number" ? Number.isFinite(v) : true));

describe("browser benchmark: batched measurement (fix 1)", () => {
  it("is not quantised by a coarse 1 ms timer: 0.3 ms frames give ≈3333 FPS", async () => {
    const r = await runBenchmark({ ...fakeRig(() => 0.3, { resolutionMs: 1 }), warmupMs: 200, measureMs: 2_000, windows: 2 });
    expect(r.stats.medianFps).toBeGreaterThan(3333 * 0.97);
    expect(r.stats.medianFps).toBeLessThan(3333 * 1.03);
    // Per-frame timing with the same clock would see 0 or 1 ms per frame — nothing near 3333.
    expect(r.batches.every((b) => b.ms >= 50)).toBe(true);
  });

  it("derives the statistics from total time and frame counts", () => {
    const s = summarize(
      [
        { frames: 10, ms: 50 },
        { frames: 10, ms: 50 },
        { frames: 5, ms: 50 },
      ],
      1,
      160,
    );
    expect(s.frames).toBe(25);
    expect(s.batches).toBe(3);
    expect(s.durationMs).toBe(150);
    expect(s.wallMs).toBe(160);
    expect(s.meanFps).toBe(Math.round((25 * 1000 * 10) / 150) / 10);
    expect(s.medianFps).toBe(200);
    expect(s.p1LowFps).toBe(100); // the slowest batch: 5 frames in 50 ms
    expect(s.p1LowFps).toBeLessThanOrEqual(s.medianFps);
  });

  it("detects a slowdown towards the end (throttling) and unstable batches", () => {
    const slow = summarize(Array.from({ length: 120 }, (_, i) => ({ frames: i < 60 ? 10 : 8, ms: 50 })), 6);
    expect(slow.drift!).toBeLessThan(-0.15);
    expect(assess(slow, { hidden: false, stalled: false, software: false }).issues).toContain("throttling");
    const noisy = summarize(Array.from({ length: 60 }, (_, i) => ({ frames: i % 2 ? 2 : 10, ms: 50 })));
    expect(assess(noisy, { hidden: false, stalled: false, software: false }).issues).toContain("unstable");
  });
});

describe("browser benchmark: measurement loop", () => {
  it("warms up, then measures for the set wall time (not limited by refresh rate)", async () => {
    const r = await runBenchmark({ ...fakeRig(() => 2), warmupMs: 100, measureMs: 1_000, windows: 2 });
    expect(r.stats.medianFps).toBe(500);
    expect(r.stats.frames).toBe(500);
    expect(r.hidden || r.stalled).toBe(false);
  });

  it("stops on cancel", async () => {
    const ctrl = new AbortController();
    let n = 0;
    const p = runBenchmark({ ...fakeRig(() => 10), warmupMs: 100, measureMs: 10_000, windows: 1, signal: ctrl.signal, onProgress: () => ++n === 5 && ctrl.abort() });
    await expect(p).rejects.toBeInstanceOf(BenchAborted);
  });

  it("flags hidden tabs and suspended pages during measurement", async () => {
    const hidden = await runBenchmark({ ...fakeRig(() => 10, { hiddenAfterMs: 600 }), warmupMs: 100, measureMs: 5_000, windows: 1 });
    expect(hidden.hidden).toBe(true);
    expect(hidden.interruptedIn).toBe("measure");
    expect(assess(hidden.stats, { hidden: true, stalled: false, software: false }).valid).toBe(false);
    const paused = await runBenchmark({ ...fakeRig(() => 10, { pauseAtMs: 800 }), warmupMs: 100, measureMs: 5_000, windows: 1 });
    expect(paused.stalled).toBe(true);
    expect(assess(paused.stats, { hidden: false, stalled: paused.stalled, software: false }).valid).toBe(false);
  });

  it("returns a clear invalid status without NaN when the tab is hidden during warm-up (fix 6)", async () => {
    const r = await runBenchmark({ ...fakeRig(() => 10, { hiddenAfterMs: 60 }), warmupMs: 3_000, measureMs: 10_000, windows: 2 });
    expect(r.interruptedIn).toBe("warmup");
    expect(r.stats.measured).toBe(false);
    expect(r.stats.frames).toBe(0);
    expect(allFinite(r.stats)).toBe(true);
    const a = assess(r.stats, { hidden: r.hidden, stalled: r.stalled, software: false });
    expect(a.valid).toBe(false);
    expect(a.issues).toEqual(expect.arrayContaining(["no-measurement", "hidden"]));
  });
});

describe("browser benchmark: backend selection", () => {
  const ok = (software = false): BackendInfo => ({ supported: true, reason: null, renderer: "GPU", vendor: null, masked: false, software });
  const no: BackendInfo = { supported: false, reason: "нет", renderer: null, vendor: null, masked: true, software: false };

  it("falls back to WebGL2 without WebGPU, and refuses when neither exists", () => {
    expect(chooseBackend({ webgpu: no, webgl2: ok() })).toBe("webgl2");
    expect(chooseBackend({ webgpu: ok(), webgl2: ok() })).toBe("webgpu");
    expect(chooseBackend({ webgpu: no, webgl2: no })).toBeNull();
    expect(chooseBackend({ webgpu: no, webgl2: ok() }, "webgpu")).toBe("webgl2");
    expect(chooseBackend({ webgpu: ok(true), webgl2: ok() })).toBe("webgl2");
  });

  it("recognises software renderers and keeps the agent coarse", () => {
    expect(isSoftwareRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)")).toBe(true);
    expect(isSoftwareRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(false);
    expect(describeAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")).toEqual({ browser: "Chrome 141", os: "Windows" });
  });
});

/** A real run on the fake clock, turned into the payload the client sends. */
async function measuredSubmission(opts: { frameMs?: number; yieldMs?: number; preset?: Submission["preset"] } = {}): Promise<Submission> {
  const mode = BENCH_MODES.short;
  const r = await runBenchmark({ ...fakeRig(() => opts.frameMs ?? 8, { yieldMs: opts.yieldMs ?? 0.3 }), warmupMs: mode.warmupMs, measureMs: mode.measureMs, windows: mode.windows });
  const s = r.stats;
  const preset = BENCH_PRESETS[opts.preset ?? "medium"];
  return {
    version: BENCH_VERSION,
    backend: "webgl2",
    preset: preset.id,
    mode: "short",
    width: preset.width,
    height: preset.height,
    stats: { measured: true, frames: s.frames, batches: s.batches, durationMs: s.durationMs, wallMs: s.wallMs, medianMs: s.medianMs, medianFps: s.medianFps, meanFps: s.meanFps, p1LowFps: s.p1LowFps, cv: s.cv, drift: s.drift, windowFps: s.windowFps },
    issues: [],
    software: false,
    gpuRenderer: null,
    browser: "Chrome 141",
    os: "Windows",
    logicalCores: 16,
  };
}

describe("browser benchmark: publication checks (fix 2)", () => {
  it("accepts a real fast run whose busy time is below the wall time", async () => {
    // 0.4 ms frames + pauses between batches: the busy time is clearly below 10 s of wall time.
    const s = await measuredSubmission({ frameMs: 0.4, yieldMs: 2, preset: "light" });
    expect(s.stats.durationMs).toBeLessThan(BENCH_MODES.short.measureMs);
    expect(s.stats.wallMs).toBeGreaterThanOrEqual(BENCH_MODES.short.measureMs);
    expect(checkSubmission(s)).toMatchObject({ ok: true });
  });

  it("still rejects forged time relations and inconsistent figures", async () => {
    const s = await measuredSubmission();
    const bad = (patch: Partial<Submission["stats"]>) => checkSubmission({ ...s, stats: { ...s.stats, ...patch } }).ok;
    expect(bad({ wallMs: 2_000 })).toBe(false); // shorter than the mode
    expect(bad({ wallMs: 60_000 })).toBe(false); // longer than the mode allows
    expect(bad({ durationMs: s.stats.wallMs * 0.5, meanFps: (s.stats.frames * 1000) / (s.stats.wallMs * 0.5) })).toBe(false); // mostly idle
    expect(bad({ durationMs: s.stats.wallMs + 500 })).toBe(false); // busy longer than wall time
    expect(bad({ batches: s.stats.batches * 10 })).toBe(false); // batches shorter than 50 ms
    expect(bad({ medianFps: s.stats.medianFps * 3 })).toBe(false); // FPS vs frame time
    expect(bad({ meanFps: s.stats.meanFps * 1.5 })).toBe(false); // frames vs time
    expect(checkSubmission({ ...s, version: "nexrig-gfx-1.0" }).ok).toBe(false);
    expect(checkSubmission({ ...s, width: 640 }).ok).toBe(false);
    expect(checkSubmission({ ...s, issues: ["hidden"] }).ok).toBe(false);
  });

  it("flags anomalies for moderation instead of trusting the numbers", async () => {
    const sw = checkSubmission({ ...(await measuredSubmission()), software: true, issues: ["software"] });
    expect(sw.ok && sw.anomalies).toContain("software");
  });
});

describe("browser results: public API and moderation (fixes 3, 4)", () => {
  it("rejects user strings outside the allowed formats", async () => {
    const { publishBrowserResult } = await import("@/lib/browser-bench/publish");
    const { getBenchmarkStore } = await import("@/lib/fps-engine/store");
    const store = getBenchmarkStore();
    const base = await measuredSubmission({ frameMs: 7 });
    expect(await publishBrowserResult(store, "u-x", { ...base, browser: "<script>alert(1)</script>" })).toMatchObject({ ok: false, status: 400 });
    expect(await publishBrowserResult(store, "u-x", { ...base, os: "Hacker OS" })).toMatchObject({ ok: false, status: 400 });
    expect(await publishBrowserResult(store, "u-x", { ...base, gpuRenderer: "Visit https://spam.example" })).toMatchObject({ ok: false, status: 400 });
    expect(await publishBrowserResult(store, "u-x", { ...base, gpuRenderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11)" })).toMatchObject({ ok: true });
  });

  it("lists only verified results publicly, hides user text until verified, records the reviewer", async () => {
    const { getBenchmarkStore } = await import("@/lib/fps-engine/store");
    const { publishBrowserResult, comparableResults, toPublic } = await import("@/lib/browser-bench/publish");
    const store = getBenchmarkStore();
    const group = { preset: "medium" as const, backend: "webgl2" as const, mode: "short" as const };
    const a = await measuredSubmission({ frameMs: 9 });
    expect(await publishBrowserResult(store, "user-a", { ...a, gpuRenderer: "NVIDIA GeForce RTX 4070" })).toMatchObject({ ok: true, status: "unverified" });
    expect(await publishBrowserResult(store, "user-a", { ...a, gpuRenderer: "NVIDIA GeForce RTX 4070" })).toMatchObject({ ok: false, status: 409 });
    expect(await publishBrowserResult(store, "user-b", await measuredSubmission({ frameMs: 10 }))).toMatchObject({ ok: true });

    let pub = await comparableResults(store, group);
    expect(pub.items).toHaveLength(0); // nothing verified yet
    expect(pub.unverified.count).toBeGreaterThanOrEqual(2);
    expect(pub.unverified).not.toHaveProperty("medianFps");

    const all = await store.listBrowserResults({ ...group, status: "unverified" });
    const target = all.items.find((r) => r.gpuRenderer === "NVIDIA GeForce RTX 4070")!;
    expect(toPublic(target).gpuRenderer).toBeNull();
    expect(toPublic(target).browser).toBeNull();
    expect(toPublic(target).os).toBeNull();

    const updated = await store.setBrowserResultStatus(target.id, "verified", "admin-1");
    expect(updated?.reviewedBy).toBe("admin-1");
    expect(updated?.reviewedAt).toBeTruthy();
    pub = await comparableResults(store, group);
    expect(pub.items.map((i) => i.id)).toEqual([target.id]);
    expect(pub.items[0].gpuRenderer).toBe("NVIDIA GeForce RTX 4070");
    expect(pub.items[0]).not.toHaveProperty("submittedBy");
    expect(pub.items[0]).not.toHaveProperty("reviewedBy");
    expect(pub.verified.count).toBe(1);

    await store.setBrowserResultStatus(target.id, "rejected", "admin-1");
    expect((await comparableResults(store, group)).items).toHaveLength(0);
  });

  it("takes the reviewer from the server-side admin check, not from the request", async () => {
    const req = new Request("http://x/api/admin/browser-results", { method: "PATCH", headers: { origin: "http://x", host: "x" } });
    expect(await requireAdmin(req, async () => ({ isAdmin: true, id: "admin-42" }))).toMatchObject({ ok: true, via: "session", userId: "admin-42" });
    expect(await requireAdmin(req, async () => ({ isAdmin: false, id: "user-1" }))).toMatchObject({ ok: false });
  });

  it("records who verified a benchmark record", async () => {
    const { getBenchmarkStore } = await import("@/lib/fps-engine/store");
    const store = getBenchmarkStore();
    const rec = {
      id: "rv1",
      gameId: "cyberpunk-2077",
      cpuId: "amd-ryzen-7-7800x3d",
      gpuId: "nvidia-founders-edition-rtx-4070",
      settings: { resolution: "1440p" as const, preset: "high" as const, rayTracing: false, upscaling: "off" as const },
      avgFps: 90,
      source: { kind: "dataset" as const, label: "Обзор", url: "https://example.com/rv1" },
      testDate: "2026-01-01",
      sampleCount: 1,
    };
    await store.insertBatch([rec], { id: "b-rv", sourceId: "nexrig", createdAt: new Date().toISOString(), rowCount: 1, status: "committed" });
    const updated = (await store.update("rv1", { verification: "verified", reviewedBy: "admin-7" })) as { verifiedBy?: string | null };
    expect(updated.verifiedBy).toBe("admin-7");
  });

  it("requires sign-in to publish and an admin to moderate", async () => {
    const { POST } = await import("@/app/api/benchmark/browser-results/route");
    expect((await POST(new Request("http://x/api/benchmark/browser-results", { method: "POST", headers: { origin: "http://x", host: "x" }, body: "{}" }))).status).toBe(401);
    const admin = await import("@/app/api/admin/browser-results/route");
    expect([401, 503]).toContain((await admin.GET(new Request("http://x/api/admin/browser-results"))).status);
    expect([401, 503]).toContain((await admin.PATCH(new Request("http://x/api/admin/browser-results", { method: "PATCH", headers: { origin: "http://x", host: "x" }, body: "{}" }))).status);
  });

  it("asks for a comparable group before listing results", async () => {
    const { GET } = await import("@/app/api/benchmark/browser-results/route");
    expect((await GET(new Request("http://x/api/benchmark/browser-results"))).status).toBe(400);
    expect((await GET(new Request("http://x/api/benchmark/browser-results?preset=medium&backend=webgl2&mode=short"))).status).toBe(200);
  });
});

describe("migration 20261016000000 (fix 9)", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261016000000_browser_benchmarks.sql"), "utf8").toLowerCase();

  it("revokes default privileges and grants only what RLS needs", () => {
    expect(sql).toContain("revoke all on public.browser_benchmark_results from anon, authenticated;");
    const grants = sql.split("\n").filter((l) => l.trim().startsWith("grant "));
    for (const g of grants) {
      expect(g).not.toMatch(/\b(insert|truncate|trigger|references|all)\b/);
      expect(g).not.toMatch(/\banon\b/);
    }
    expect(sql).toContain("enable row level security");
  });

  it("constrains user strings and flags in the database too", () => {
    expect(sql).toMatch(/browser\s+text check \(browser ~/);
    expect(sql).toMatch(/os\s+text check \(os in/);
    expect(sql).toContain("gpu_renderer !~*");
    expect(sql).toContain("issues <@ array[");
    expect(sql).toContain("browser_results_busy_le_wall");
  });
});

describe("rate limits", () => {
  it("limits bursts per client and frees the slot after the window", () => {
    const l = createRateLimiter(2, 1_000);
    expect(l.take("a", 0).ok).toBe(true);
    expect(l.take("a", 10).ok).toBe(true);
    expect(l.take("a", 20)).toMatchObject({ ok: false });
    expect(l.take("b", 20).ok).toBe(true);
    expect(l.take("a", 1_011).ok).toBe(true);
  });
});

describe("browser benchmark: stationary workload", () => {
  it("loops the animation so fast and slow GPUs render the same scene states", async () => {
    const { frameTime, LOOP_FRAMES } = await import("@/lib/browser-bench/config");
    expect(frameTime(0)).toBe(frameTime(LOOP_FRAMES));
    expect(frameTime(17)).toBe(frameTime(17 + 50 * LOOP_FRAMES));
    expect(frameTime(LOOP_FRAMES - 1)).toBeLessThan(LOOP_FRAMES / 60);
  });

  it("keeps the shader iteration bounded in both backends (no inf/NaN drift)", async () => {
    const { GLSL_FRAGMENT, WGSL } = await import("@/lib/browser-bench/scene");
    expect(GLSL_FRAGMENT).toMatch(/q = clamp\(/);
    expect(WGSL).toMatch(/q = clamp\(/);
  });
});
