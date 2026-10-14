import { getBenchmarkStore, storeErrorResponse } from "@/lib/fps-engine/store";
import { requireAdmin } from "@/lib/server/admin-auth";

/** Admin: import batches (audit trail). */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ items: await getBenchmarkStore().batches() });
  } catch (e) {
    return storeErrorResponse(e);
  }
}

/**
 * Admin: roll back a batch (?id=). Removes the batch's records that were not changed after the
 * import (edited or verified ones are kept and reported), and marks the batch "rolled_back".
 */
export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Не указан id партии." }, { status: 400 });
  try {
    const result = await getBenchmarkStore().rollback(id);
    return result ? Response.json(result) : Response.json({ error: "Партия не найдена или уже отменена." }, { status: 404 });
  } catch (e) {
    return storeErrorResponse(e);
  }
}
