import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { AnalysisEvent } from "@/lib/fps-engine/analysis-stages";

// A corrupt store: every query fails. The analysis must still finish (model only) and say so.
const dir = mkdtempSync(join(tmpdir(), "nexrig-analysis-broken-"));
const file = join(dir, "store.json");
writeFileSync(file, "{ not json");
process.env.NEXRIG_BENCHMARK_STORE = file;
process.env.NEXRIG_BENCHMARK_BACKEND = "file";

it("isolates failing stages and still returns a labelled result", async () => {
  const { POST } = await import("@/app/api/fps/analyze/route");
  const res = await POST(
    new Request("http://x/api/fps/analyze", {
      method: "POST",
      body: JSON.stringify({ cpuId: "amd-ryzen-7-7800x3d", gpuId: "nvidia-founders-edition-rtx-4070", settings: { preset: "high", rayTracing: false, upscaling: "off" }, gameIds: ["cyberpunk-2077"] }),
    }),
  );
  const events = (await res.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as AnalysisEvent);
  const errors = events.filter((e) => e.type === "stage" && e.status === "error").map((e) => (e as { id: string }).id);
  expect(errors).toEqual(expect.arrayContaining(["sources", "exact", "gpu", "cpu", "similar"]));
  const result = events.find((e) => e.type === "result");
  expect(result?.type).toBe("result");
  if (result?.type !== "result") return;
  expect(result.warnings.length).toBeGreaterThan(0);
  expect(result.report.games[0].results.every((r) => r.level === "model")).toBe(true);
  expect(result.report.limitations[0]).toMatch(/недоступн/);

  // Partial results are not cached: the next run tries the sources again.
  const again = await POST(new Request("http://x/api/fps/analyze", { method: "POST", body: JSON.stringify({ cpuId: "amd-ryzen-7-7800x3d", gpuId: "nvidia-founders-edition-rtx-4070", settings: { preset: "high", rayTracing: false, upscaling: "off" }, gameIds: ["cyberpunk-2077"] }) }));
  expect(await again.text()).toContain('"cached":false');
});
