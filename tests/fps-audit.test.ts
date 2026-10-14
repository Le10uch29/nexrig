import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GAMES } from "@/data/games";
import { DEFAULT_SELECTION } from "@/data/default-build";
import { analyzeBalance } from "@/features/compatibility/balance";
import { checkBuild } from "@/features/compatibility/engine";
import { computeFps, fpsCaveats } from "@/lib/fps-engine/engine";
import { createFileStore, createSupabaseStore, selectStore, StoreError, storeErrorResponse, supabaseConfig, type ImportBatch } from "@/lib/fps-engine/store";
import { hardwareRepository, resolveBuild } from "@/lib/hardware/repository";
import { readLimitedText, requireAdmin } from "@/lib/server/admin-auth";
import type { BenchmarkRecord, GameSettings } from "@/types/benchmark";
import type { CpuSpec, GpuSpec } from "@/types/hardware";

const cpu = hardwareRepository.byId("amd-ryzen-7-7800x3d") as CpuSpec;
const gpu = hardwareRepository.byId("nvidia-founders-edition-rtx-4070") as GpuSpec;
const fgGame = GAMES.find((g) => g.frameGen.includes("DLSS-FG"))!;
const base: GameSettings = { resolution: "1440p", preset: "high", rayTracing: false, upscaling: "off", upscaler: null, frameGen: false };
const fgSettings: GameSettings = { ...base, upscaling: "quality", upscaler: "DLSS", frameGen: true };

const rec = (patch: Partial<BenchmarkRecord> = {}): BenchmarkRecord => ({
  id: "x",
  gameId: fgGame.id,
  cpuId: cpu.id,
  gpuId: gpu.id,
  settings: base,
  avgFps: 100,
  source: { kind: "dataset", label: "Обзор", url: "https://example.com/r" },
  sourceId: "nexrig",
  testDate: "2026-01-10",
  sampleCount: 1,
  verification: "verified",
  ...patch,
});

describe("audit: frame generation is never mixed with native FPS", () => {
  it("an exact measurement taken with frame generation is reported as presented FPS only", () => {
    const r = computeFps({ game: fgGame, cpu, gpu, settings: fgSettings, records: [rec({ settings: fgSettings, avgFps: 175 })] });
    expect(r.level).toBe("verified");
    expect(r.averageFpsEstimate).toBeNull();
    expect(r.frameGenFps).toBe(175);
    expect(r.onePercentLow).toBeNull();
  });

  it("calibration from frame-generation records does not inflate native FPS", () => {
    const model = computeFps({ game: fgGame, cpu, gpu, settings: fgSettings, records: [] });
    // A record that matches the model's presented FPS at another resolution: native stays ~unchanged.
    const atOtherRes = { ...fgSettings, resolution: "4K" as const };
    const modelOther = computeFps({ game: fgGame, cpu, gpu, settings: atOtherRes, records: [] });
    const calibrated = computeFps({ game: fgGame, cpu, gpu, settings: fgSettings, records: [rec({ settings: atOtherRes, avgFps: modelOther.frameGenFps! })] });
    expect(calibrated.level).toBe("close");
    expect(Math.abs(calibrated.averageFpsEstimate! - model.averageFpsEstimate!)).toBeLessThanOrEqual(10);
    expect(calibrated.frameGenFps!).toBeGreaterThan(calibrated.averageFpsEstimate!);
  });
});

describe("audit: model results carry no invented data", () => {
  it("has no 1% low without measurements; a close test with 1% low supplies one", () => {
    expect(computeFps({ game: GAMES[0], cpu, gpu, settings: base, records: [] }).onePercentLow).toBeNull();
    const close = computeFps({ game: GAMES[0], cpu, gpu, settings: { ...base, resolution: "4K" }, records: [rec({ gameId: GAMES[0].id, avgFps: 100, low1Fps: 80 })] });
    expect(close.level).toBe("close");
    expect(close.onePercentLow).not.toBeNull();
  });

  it("returns no number when a performance index is missing (0)", () => {
    const r = computeFps({ game: GAMES[0], cpu: { ...cpu, gamingIndex: 0 }, gpu, settings: base, records: [] });
    expect(r.level).toBe("insufficient");
    expect(r.averageFpsEstimate).toBeNull();
  });

  it("explains identical FPS across resolutions when the CPU is the limit", () => {
    const slow = hardwareRepository.byId("intel-core-i5-7400") as CpuSpec;
    const fast = hardwareRepository.byId("nvidia-founders-edition-rtx-5080") as GpuSpec;
    const at = (resolution: GameSettings["resolution"]) => computeFps({ game: GAMES[0], cpu: slow, gpu: fast, settings: { ...base, resolution }, records: [] });
    const r1080 = at("1080p");
    expect(r1080.averageFpsEstimate).toBe(at("1440p").averageFpsEstimate);
    expect(r1080.limitations.join(" ")).toMatch(/Упор в процессор/);
  });

  it("warns that FPS for an incompatible build is hypothetical", () => {
    const checks = checkBuild({ ...DEFAULT_SELECTION, cpu: "intel-core-i7-14700k" }).checks;
    expect(fpsCaveats(checks).length).toBeGreaterThan(0);
    expect(fpsCaveats(checkBuild(DEFAULT_SELECTION).checks)).toHaveLength(0);
  });
});

describe("audit: balance handles unknown specs", () => {
  it("reports unknown instead of NaN or a made-up score", () => {
    const b = resolveBuild({ ...DEFAULT_SELECTION, gpu: "nvidia-founders-edition-rtx-4070" });
    const report = analyzeBalance({ ...b, gpu: { ...b.gpu!, rasterIndex: 0, vramGb: 0 }, ram: { ...b.ram!, moduleSizeGb: Number.NaN } });
    for (const id of ["cpu-gpu", "vram", "ram"]) {
      const item = report.items.find((i) => i.id === id)!;
      expect(item.status, id).toBe("unknown");
      expect(item.scorePct, id).toBeNull();
    }
    expect(Number.isNaN(report.overallPct)).toBe(false);
  });
});

describe("audit: storage", () => {
  const dir = mkdtempSync(join(tmpdir(), "nexrig-audit-"));
  const batch = (id: string, createdAt = new Date().toISOString()): ImportBatch => ({ id, sourceId: "nexrig", createdAt, rowCount: 0, status: "committed" });

  it("rollback keeps records edited or verified after the import", async () => {
    const store = createFileStore(join(dir, "rb.json"));
    const old = new Date(Date.now() - 60_000).toISOString();
    await store.insertBatch([rec({ id: "a", testDate: "2026-01-01" }), rec({ id: "b", testDate: "2026-01-02" })], batch("11111111-1111-1111-1111-111111111111", old));
    await store.update("a", { verification: "verified" });
    const result = await store.rollback("11111111-1111-1111-1111-111111111111");
    expect(result).toEqual({ removed: 1, kept: 1 });
    expect((await store.query({})).map((r) => r.id)).toEqual(["a"]);
    // A second rollback of the same batch is refused.
    expect(await store.rollback("11111111-1111-1111-1111-111111111111")).toBeNull();
  });

  it("concurrent imports of the same test store it once", async () => {
    const store = createFileStore(join(dir, "race.json"));
    const r = rec({ id: "c1" });
    const [x, y] = await Promise.all([store.insertBatch([r], batch("b1")), store.insertBatch([{ ...r, id: "c2" }], batch("b2"))]);
    expect(x.inserted + y.inserted).toBe(1);
    expect(x.skippedDuplicates + y.skippedDuplicates).toBe(1);
  });

  it("a corrupted store fails closed with a safe message", async () => {
    const file = join(dir, "broken.json");
    writeFileSync(file, "{ not json");
    const store = createFileStore(file);
    await expect(store.list({ verification: "verified" })).rejects.toBeInstanceOf(StoreError);
    const res = storeErrorResponse(await store.list({}).catch((e) => e));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/broken\.json|[A-Z]:\\/);
  });

  it("an unwritable store reports an error and keeps the previous state", async () => {
    const asFile = join(dir, "not-a-dir");
    writeFileSync(asFile, "x");
    const store = createFileStore(join(asFile, "store.json"));
    await expect(store.insertBatch([rec()], batch("w1"))).rejects.toThrow(/недоступно для записи/);
    expect(await store.count({})).toBe(0);
  });
});

describe("audit: Supabase configuration and failure modes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses Supabase only with a secret key over https, accepting a /rest/v1 URL", () => {
    expect(supabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/rest/v1/", SUPABASE_SECRET_KEY: "sb_secret_x" })).toEqual({ url: "https://abc.supabase.co", key: "sb_secret_x" });
    expect(supabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", SUPABASE_SECRET_KEY: "sb_publishable_x" })).toBeNull();
    expect(supabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "http://abc.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_x" })).toBeNull();
    expect(supabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBeNull();
  });

  it("on Vercel never falls back to the local JSON file", async () => {
    const supa = { VERCEL: "1", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/rest/v1/", SUPABASE_SECRET_KEY: "sb_secret_x" };
    expect(selectStore(supa).kind).toBe("supabase");
    // Missing secret key, or a forced file backend: refuse instead of writing to a disposable file.
    for (const env of [{ VERCEL: "1" }, { VERCEL: "1", NEXRIG_BENCHMARK_BACKEND: "file", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" }]) {
      const store = selectStore(env);
      await expect(store.query({ verification: "verified" })).rejects.toThrow(/Vercel нужен Supabase/);
      await expect(store.insertBatch([], { id: "b", sourceId: "nexrig", createdAt: new Date().toISOString(), rowCount: 0, status: "committed" })).rejects.toBeInstanceOf(StoreError);
    }
    // Local development keeps the file fallback.
    expect(selectStore({}, mkdtempSync(join(tmpdir(), "nexrig-sel-"))).kind).toBe("file");
  });

  it("reports a missing migration instead of serving unfiltered data", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify({ code: "42703", message: "column verification_status does not exist" }), { status: 400 });
      }),
    );
    const store = createSupabaseStore("https://abc.supabase.co", "sb_secret_x");
    await expect(store.list({ verification: "verified" })).rejects.toThrow(/миграцию/);
    expect(calls[0]).toContain("verification_status=eq.verified");
  });

  it("never sends the key in the URL and maps network errors to a safe message", async () => {
    let seen = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        seen = url;
        throw new Error("ECONNREFUSED 10.0.0.1:443");
      }),
    );
    const store = createSupabaseStore("https://abc.supabase.co", "sb_secret_x");
    const err = await store.count({}).catch((e) => e);
    expect(err).toBeInstanceOf(StoreError);
    expect(err.message).not.toMatch(/ECONNREFUSED|10\.0\.0\.1/);
    expect(seen).not.toContain("sb_secret_x");
  });
});

describe("audit: request limits and admin configuration", () => {
  it("refuses oversized streamed bodies even without Content-Length", async () => {
    const big = new ReadableStream({
      start(c) {
        for (let i = 0; i < 20; i++) c.enqueue(new Uint8Array(1000));
        c.close();
      },
    });
    const req = new Request("http://x", { method: "POST", body: big, duplex: "half" } as RequestInit & { duplex: "half" });
    expect(req.headers.get("content-length")).toBeNull();
    const r = await readLimitedText(req, 5000);
    expect(r.ok).toBe(false);
  });

  it("treats a too-short admin token as not configured (fails closed)", async () => {
    const prev = process.env.NEXRIG_ADMIN_TOKEN;
    process.env.NEXRIG_ADMIN_TOKEN = "short";
    const r = await requireAdmin(new Request("http://x", { headers: { Authorization: "Bearer short" } }), async () => null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(503);
    process.env.NEXRIG_ADMIN_TOKEN = prev;
  });

  it("admits a signed-in admin session, refuses ordinary users and cross-site writes", async () => {
    const admin = async () => ({ isAdmin: true });
    const user = async () => ({ isAdmin: false });
    const status = async (req: Request, who: () => Promise<{ isAdmin: boolean } | null>) => {
      const r = await requireAdmin(req, who);
      return r.ok ? 200 : r.response.status;
    };
    expect(await status(new Request("http://site.test/api/admin/benchmarks", { headers: { host: "site.test" } }), admin)).toBe(200);
    expect(await status(new Request("http://site.test/api/admin/benchmarks", { headers: { host: "site.test" } }), user)).toBe(403);
    const post = (origin: string) => new Request("http://site.test/api/admin/benchmarks", { method: "POST", headers: { host: "site.test", origin }, body: "{}" });
    expect(await status(post("http://site.test"), admin)).toBe(200);
    expect(await status(post("https://evil.example"), admin)).toBe(403);
    // A wrong bearer token is rejected even if an admin cookie session exists.
    const prev = process.env.NEXRIG_ADMIN_TOKEN;
    process.env.NEXRIG_ADMIN_TOKEN = "configured-token-0123456789abcdef";
    expect(await status(new Request("http://site.test/x", { headers: { Authorization: "Bearer wrong" } }), admin)).toBe(401);
    process.env.NEXRIG_ADMIN_TOKEN = prev;
  });
});
