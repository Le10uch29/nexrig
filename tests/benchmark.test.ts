import { describe, expect, it } from "vitest";
import { GAMES } from "@/data/games";
import { estimateFps, getPerformance } from "@/lib/benchmark-engine/estimate";
import { composeDeterministic, runSpecialists } from "@/lib/agents/coordinator";
import { DEFAULT_SELECTION } from "@/data/default-build";
import { hardwareRepository } from "@/lib/hardware/repository";
import type { BenchmarkRecord, GameSettings } from "@/types/benchmark";
import type { CpuSpec, GpuSpec } from "@/types/hardware";

const cpu = hardwareRepository.byId("amd-ryzen-7-7800x3d") as CpuSpec;
const gpu = hardwareRepository.byId("nvidia-founders-edition-rtx-5070") as GpuSpec;
const fast = hardwareRepository.byId("nvidia-founders-edition-rtx-5090") as GpuSpec;
const game = GAMES.find((g) => g.id === "cyberpunk-2077")!;
const settings: GameSettings = { resolution: "1440p", preset: "high", rayTracing: false, upscaling: "off" };

describe("benchmark engine", () => {
  it("labels model output as a low-confidence estimate with a range", () => {
    const r = estimateFps({ game, cpu, gpu, settings });
    expect(r.kind).toBe("estimated");
    expect(r.confidence).toBe("low");
    expect(r.rangeFps[0]).toBeLessThan(r.avgFps);
    expect(r.rangeFps[1]).toBeGreaterThan(r.avgFps);
  });

  it("is deterministic and monotonic in GPU power and resolution", () => {
    const a = estimateFps({ game, cpu, gpu, settings });
    expect(estimateFps({ game, cpu, gpu, settings })).toEqual(a);
    expect(estimateFps({ game, cpu, gpu: fast, settings }).avgFps).toBeGreaterThan(a.avgFps);
    expect(estimateFps({ game, cpu, gpu, settings: { ...settings, resolution: "4K" } }).avgFps).toBeLessThan(a.avgFps);
  });

  it("prefers exact measured records over estimates", () => {
    const record: BenchmarkRecord = {
      id: "t1",
      gameId: game.id,
      cpuId: cpu.id,
      gpuId: gpu.id,
      settings,
      avgFps: 101,
      low1Fps: 80,
      source: { kind: "user", label: "Тест" },
      testDate: "2026-10-01",
      sampleCount: 3,
    };
    const r = getPerformance({ game, cpu, gpu, settings, measured: [record] });
    expect(r.kind).toBe("measured");
    if (r.kind === "measured") expect(r.avgFps).toBe(101);
    const other = getPerformance({ game, cpu, gpu, settings: { ...settings, preset: "ultra" }, measured: [record] });
    // Same GPU and game, other preset: the model is calibrated by the record, not presented as measured.
    expect(other.kind).toBe("calibrated");
  });

  it("falls back to raster with a stated assumption on GPUs without hardware RT", () => {
    const gtx = hardwareRepository.byId("nvidia-founders-edition-gtx-1080") as GpuSpec;
    const off = estimateFps({ game, cpu, gpu: gtx, settings });
    const on = estimateFps({ game, cpu, gpu: gtx, settings: { ...settings, rayTracing: true } });
    expect(on.avgFps).toBe(off.avgFps);
    expect(on.assumptions.some((a) => a.includes("трассировки"))).toBe(true);
  });

  it("returns 'unavailable' rather than a number when there is no GPU", () => {
    expect(getPerformance({ game, cpu, gpu: undefined, settings, measured: [] }).kind).toBe("unavailable");
  });
});

describe("agents", () => {
  it("run deterministically and report the tools they executed", () => {
    const req = { question: "Какой апгрейд?", selection: { ...DEFAULT_SELECTION, gpu: "asus-dual-rtx-4060" } };
    const a = runSpecialists(req);
    expect(a.map((x) => x.agent)).toEqual(["compatibility", "benchmark", "upgrade", "price"]);
    expect(a.every((x) => x.toolCalls.length > 0)).toBe(true);
    expect(composeDeterministic(req.question, a)).toBe(composeDeterministic(req.question, runSpecialists(req)));
  });
});
