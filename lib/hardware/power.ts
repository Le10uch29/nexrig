import type { ResolvedBuild } from "./repository";

/** Allowances for parts without published power figures (W). Conservative round numbers. */
export const POWER_ALLOWANCE = {
  motherboard: 50,
  perRamModule: 5,
  perNvme: 8,
  perSata: 4,
  perHdd: 8,
  perFan: 3,
  aioPump: 6,
} as const;

/**
 * Estimated sustained peak system draw. Uses CPU peak package power and GPU board power;
 * transient spikes are handled by the headroom rule in the compatibility engine.
 * Returns null when there's no CPU (nothing meaningful to estimate).
 */
export function estimatePeakPower(b: ResolvedBuild): number | null {
  if (!b.cpu) return null;
  let w = b.cpu.peakPowerW + POWER_ALLOWANCE.motherboard;
  if (b.gpu) w += b.gpu.boardPowerW;
  if (b.ram) w += b.ramCount * POWER_ALLOWANCE.perRamModule;
  for (const s of b.storage) w += s.kind === "hdd" ? POWER_ALLOWANCE.perHdd : s.interface === "NVMe" ? POWER_ALLOWANCE.perNvme : POWER_ALLOWANCE.perSata;
  if (b.fans) w += b.fans.count * POWER_ALLOWANCE.perFan;
  if (b.cooler?.kind === "aio") w += POWER_ALLOWANCE.aioPump;
  return Math.round(w);
}

/** Recommended PSU: 30% headroom over estimated peak, rounded up to 50 W, never below the GPU vendor's figure. */
export function recommendedPsuWattage(b: ResolvedBuild): number | null {
  const peak = estimatePeakPower(b);
  if (peak === null) return null;
  const byPeak = Math.ceil((peak * 1.3) / 50) * 50;
  return Math.max(byPeak, b.gpu?.recommendedPsuW ?? 0);
}

/** 8-pin count a 12V-2x6 adapter needs for a given board power. */
export function adapterPinsFor(boardPowerW: number): number {
  if (boardPowerW <= 300) return 2;
  if (boardPowerW <= 450) return 3;
  return 4;
}
