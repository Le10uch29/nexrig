import type { BenchmarkRecord, GameSettings } from "@/types/benchmark";

/**
 * FPS Lab inputs. Only verified records from the NexRig base are used in calculations; the user's
 * own records (kept in this browser, never verified) are shown separately and never count as a
 * confirmed test.
 */
export function splitLabRecords(
  own: BenchmarkRecord[],
  verified: BenchmarkRecord[],
  q: { gameId: string; cpuId?: string; gpuId?: string; settings: Pick<GameSettings, "resolution"> },
): { forCalculation: BenchmarkRecord[]; ownMatching: BenchmarkRecord[] } {
  return {
    forCalculation: verified.filter((r) => r.verification === undefined || r.verification === "verified"),
    ownMatching: own.filter((r) => r.gameId === q.gameId && r.cpuId === q.cpuId && r.gpuId === q.gpuId && r.settings.resolution === q.settings.resolution),
  };
}
