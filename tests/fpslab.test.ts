import { describe, expect, it } from "vitest";
import { GAMES } from "@/data/games";
import { availableFrameGen, availableUpscalers, effectiveSettings, estimateFps, getPerformance, targetVerdict } from "@/lib/benchmark-engine/estimate";
import { hardwareRepository } from "@/lib/hardware/repository";
import type { BenchmarkRecord, GameSettings } from "@/types/benchmark";
import type { CpuSpec, GpuSpec } from "@/types/hardware";

const gpu = (id: string) => hardwareRepository.byId(id) as GpuSpec;
const cpu = hardwareRepository.byId("amd-ryzen-7-7800x3d") as CpuSpec;
const game = (id: string) => GAMES.find((g) => g.id === id)!;
const base: GameSettings = { resolution: "1440p", preset: "high", rayTracing: false, upscaling: "off" };

describe("FPS Lab: supported technologies", () => {
  it("offers DLSS only on RTX cards and only in games that ship it", () => {
    expect(availableUpscalers(game("cyberpunk-2077"), gpu("nvidia-founders-edition-rtx-5070"))).toContain("DLSS");
    expect(availableUpscalers(game("cyberpunk-2077"), gpu("amd-reference-rx-7800-xt"))).not.toContain("DLSS");
    expect(availableUpscalers(game("cs2"), gpu("nvidia-founders-edition-rtx-5070"))).toEqual(["FSR"]);
  });

  it("offers frame generation only where game and GPU support it", () => {
    expect(availableFrameGen(game("cyberpunk-2077"), gpu("nvidia-founders-edition-rtx-5070"))).toBe("DLSS-FG");
    expect(availableFrameGen(game("cyberpunk-2077"), gpu("nvidia-founders-edition-rtx-3070"))).toBe("FSR-FG");
    expect(availableFrameGen(game("cyberpunk-2077"), gpu("nvidia-founders-edition-gtx-1080"))).toBeNull();
    expect(availableFrameGen(game("alan-wake-2"), gpu("amd-reference-rx-7800-xt"))).toBeNull();
    expect(availableFrameGen(game("cs2"), gpu("nvidia-founders-edition-rtx-5090"))).toBeNull();
  });

  it("switches off unsupported options with an explanation instead of applying them", () => {
    const eff = effectiveSettings(game("cs2"), gpu("nvidia-founders-edition-rtx-5070"), { ...base, upscaling: "quality", upscaler: "DLSS", frameGen: true, rayTracing: true });
    expect(eff.upscaler).toBe("FSR");
    expect(eff.frameGen).toBeNull();
    expect(eff.rt).toBe(false);
    expect(eff.notes.length).toBeGreaterThanOrEqual(3);
  });

  it("reports frame-generation FPS separately from rendered FPS", () => {
    const r = estimateFps({ game: game("cyberpunk-2077"), cpu, gpu: gpu("nvidia-founders-edition-rtx-5070"), settings: { ...base, frameGen: true } });
    expect(r.frameGenFps).toBeGreaterThan(r.avgFps);
    expect(estimateFps({ game: game("cyberpunk-2077"), cpu, gpu: gpu("nvidia-founders-edition-rtx-5070"), settings: base }).frameGenFps).toBeNull();
  });
});

describe("FPS Lab: model inputs", () => {
  it("lowers the CPU-side ceiling for single-channel memory", () => {
    const g = game("cs2");
    const dual = estimateFps({ game: g, cpu, gpu: gpu("nvidia-founders-edition-rtx-5090"), settings: base, memory: { type: "DDR5", speedMtps: 6000, modules: 2 } });
    const single = estimateFps({ game: g, cpu, gpu: gpu("nvidia-founders-edition-rtx-5090"), settings: base, memory: { type: "DDR5", speedMtps: 6000, modules: 1 } });
    expect(single.cpuBoundFps).toBeLessThan(dual.cpuBoundFps);
    expect(single.assumptions.some((a) => a.includes("одноканальный"))).toBe(true);
  });

  it("identifies CPU-bound and GPU-bound scenarios", () => {
    const slowGpu = estimateFps({ game: game("cyberpunk-2077"), cpu, gpu: gpu("nvidia-founders-edition-gtx-1060-6-гб"), settings: { ...base, resolution: "4K" } });
    expect(slowGpu.bottleneck).toBe("gpu");
    const slowCpu = estimateFps({ game: game("cs2"), cpu: hardwareRepository.byId("intel-core-i3-2100") as CpuSpec, gpu: gpu("nvidia-founders-edition-rtx-5090"), settings: { ...base, resolution: "1080p", preset: "low" } });
    expect(slowCpu.bottleneck).toBe("cpu");
  });

  it("gives different results per game and settings (no universal value)", () => {
    const values = GAMES.map((g) => estimateFps({ game: g, cpu, gpu: gpu("nvidia-founders-edition-rtx-5070"), settings: base }).avgFps);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("FPS Lab: data tiers", () => {
  const record = (over: Partial<BenchmarkRecord>): BenchmarkRecord => ({
    id: "r",
    gameId: "cyberpunk-2077",
    cpuId: "amd-ryzen-7-7800x3d",
    gpuId: "nvidia-founders-edition-rtx-5070",
    settings: base,
    avgFps: 100,
    source: { kind: "user", label: "Тестовый прогон" },
    testDate: "2026-10-01",
    sampleCount: 3,
    ...over,
  });

  it("uses exact measurements first, then calibrates other settings for the same GPU, else a plain estimate", () => {
    const g = game("cyberpunk-2077");
    const g5070 = gpu("nvidia-founders-edition-rtx-5070");
    const rec = record({});
    expect(getPerformance({ game: g, cpu, gpu: g5070, settings: base, measured: [rec] }).kind).toBe("measured");
    const other = getPerformance({ game: g, cpu, gpu: g5070, settings: { ...base, resolution: "4K" }, measured: [rec] });
    expect(other.kind).toBe("calibrated");
    if (other.kind === "calibrated") expect(other.confidence).toBe("medium");
    expect(getPerformance({ game: g, cpu, gpu: gpu("nvidia-founders-edition-rtx-5080"), settings: base, measured: [rec] }).kind).toBe("estimated");
  });

  it("says data is insufficient instead of inventing numbers", () => {
    const r = getPerformance({ game: game("cs2"), cpu, gpu: undefined, settings: base, measured: [] });
    expect(r.kind).toBe("unavailable");
    if (r.kind === "unavailable") expect(r.reason).toContain("Недостаточно данных");
  });

  it("judges a target FPS on the lower bound of the uncertainty range", () => {
    const r = estimateFps({ game: game("cs2"), cpu, gpu: gpu("nvidia-founders-edition-rtx-5070"), settings: base });
    expect(targetVerdict(r, Math.floor(r.rangeFps[0] * 0.9))).toBe("meets");
    expect(targetVerdict(r, r.avgFps)).toBe("borderline");
    expect(targetVerdict(r, r.rangeFps[1] * 2)).toBe("misses");
  });
});
