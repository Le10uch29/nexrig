import { badRequest, listQuerySchema } from "@/lib/fps-engine/api-schemas";
import { getBenchmarkStore, storeErrorResponse } from "@/lib/fps-engine/store";

/** Public, paginated list of VERIFIED benchmark records only. */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = listQuerySchema.safeParse(params);
  if (!parsed.success) return badRequest(parsed.error);
  const { page, pageSize, gameId, cpuId, gpuId, resolution, sourceId } = parsed.data;
  try {
    // The verification filter is fixed server-side; clients cannot request unverified data here.
    const result = await getBenchmarkStore().list({ gameId, cpuId, gpuId, resolution, sourceId, verification: "verified" }, page, pageSize);
    // Authors of community measurements are not disclosed publicly.
    return Response.json({ ...result, items: result.items.map(({ submittedBy, ...r }) => ({ ...r, community: Boolean(submittedBy) })) });
  } catch (e) {
    return storeErrorResponse(e);
  }
}
