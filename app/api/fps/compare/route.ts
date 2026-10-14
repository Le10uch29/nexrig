import { badRequest, compareSchema } from "@/lib/fps-engine/api-schemas";
import { computeFpsByIds } from "@/lib/fps-engine/engine";
import { recordsForCalculation } from "@/lib/fps-engine/store";

/** Several configurations (and optionally several resolutions) under the same game and settings. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ожидается JSON." }, { status: 400 });
  }
  const parsed = compareSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  const { gameId, settings, configs, resolutions } = parsed.data;
  let storeWarning: string | null = null;
  const results = await Promise.all(
    configs.map(async (c) => {
      const { records, warning } = await recordsForCalculation({ gameId, gpuId: c.gpuId });
      storeWarning ??= warning;
      const byResolution = (resolutions ?? [settings.resolution]).map((resolution) => ({
        resolution,
        estimate: computeFpsByIds({ gameId, cpuId: c.cpuId, gpuId: c.gpuId, ram: c.ram, settings: { ...settings, resolution }, records }),
      }));
      return { label: c.label ?? null, cpuId: c.cpuId, gpuId: c.gpuId, results: byResolution };
    }),
  );
  return Response.json({ gameId, settings, configs: results, storeWarning });
}
