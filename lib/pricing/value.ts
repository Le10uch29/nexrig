import type { CpuSpec, GpuSpec } from "@/types/hardware";

/**
 * Value metrics computed from demo prices and model indices. Both inputs are non-authoritative,
 * so results are relative rankings within the demo dataset, not market advice.
 */
export function gpuValue(gpu: GpuSpec) {
  return (gpu.rasterIndex / gpu.price.amountRub) * 10000;
}

export function cpuValue(cpu: CpuSpec) {
  return (cpu.gamingIndex / cpu.price.amountRub) * 10000;
}

/** Roubles per index point (lower is better). */
export function rubPerPoint(priceRub: number, index: number) {
  return Math.round(priceRub / index);
}
