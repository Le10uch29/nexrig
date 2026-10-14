import { badRequest, estimateSchema } from "@/lib/fps-engine/api-schemas";
import { computeFpsByIds } from "@/lib/fps-engine/engine";
import { recordsForCalculation } from "@/lib/fps-engine/store";

/** FPS for one configuration. Uses verified records of this game and GPU, then the model. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ожидается JSON." }, { status: 400 });
  }
  const parsed = estimateSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  const q = parsed.data;
  const { records, warning } = await recordsForCalculation({ gameId: q.gameId, gpuId: q.gpuId });
  const estimate = computeFpsByIds({ ...q, records });
  return Response.json(warning ? { ...estimate, limitations: [warning, ...estimate.limitations], storeWarning: warning } : estimate);
}
