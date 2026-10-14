import { randomUUID } from "node:crypto";
import { badRequest, listQuerySchema, patchSchema } from "@/lib/fps-engine/api-schemas";
import { SOURCE_IDS } from "@/lib/fps-engine/sources";
import { getBenchmarkStore, storeErrorResponse } from "@/lib/fps-engine/store";
import { previewImport } from "@/lib/fps-engine/validation";
import { readLimitedText, requireAdmin } from "@/lib/server/admin-auth";

/** Admin: list all records (any verification status), paginated and filterable. */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return badRequest(parsed.error);
  const { page, pageSize, verification, ...filter } = parsed.data;
  try {
    return Response.json(await getBenchmarkStore().list({ ...filter, verification: verification ?? "any" }, page, pageSize));
  } catch (e) {
    return storeErrorResponse(e);
  }
}

/** Admin: add one record (same validation as imports). */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const body = await readLimitedText(request, 20_000);
  if (!body.ok) return body.response;
  try {
    let row: unknown;
    try {
      row = JSON.parse(body.text);
    } catch {
      return Response.json({ error: "Ожидается JSON-объект записи." }, { status: 400 });
    }
    if (!row || typeof row !== "object" || Array.isArray(row)) return Response.json({ error: "Ожидается JSON-объект записи." }, { status: 400 });
    const store = getBenchmarkStore();
    const r = row as { game_id?: unknown; gpu_id?: unknown };
    const existing = typeof r.game_id === "string" && typeof r.gpu_id === "string" ? await store.similar([{ gameId: r.game_id, gpuId: r.gpu_id }]) : [];
    const preview = previewImport({ format: "json", content: JSON.stringify([row]) }, existing, SOURCE_IDS, () => randomUUID());
    if (preview.errors.length || preview.duplicates.length) {
      return Response.json({ error: "Запись не прошла проверку.", errors: preview.errors, duplicates: preview.duplicates }, { status: 422 });
    }
    const record = preview.valid[0].record;
    const result = await store.insertBatch([record], {
      id: randomUUID(),
      sourceId: record.sourceId ?? "nexrig",
      createdAt: new Date().toISOString(),
      rowCount: 1,
      status: "committed",
      notes: "Ручной ввод",
    });
    if (result.inserted === 0) return Response.json({ error: "Такая запись уже есть (дубликат)." }, { status: 409 });
    return Response.json({ batchId: result.batch.id, record }, { status: 201 });
  } catch (e) {
    return storeErrorResponse(e);
  }
}

/** Admin: edit a record or set its verification status. */
export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const body = await readLimitedText(request, 10_000);
  if (!body.ok) return body.response;
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return Response.json({ error: "Ожидается JSON." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return badRequest(parsed.error);
  const { id, ...patch } = parsed.data;
  try {
    const store = getBenchmarkStore();
    const current = await store.get(id);
    if (!current) return Response.json({ error: "Запись не найдена." }, { status: 404 });
    const avg = patch.avgFps ?? current.avgFps;
    const low = patch.low1Fps ?? current.low1Fps;
    if (low !== undefined && low > avg) return Response.json({ error: "1% low не может быть выше среднего FPS." }, { status: 422 });
    return Response.json(await store.update(id, patch));
  } catch (e) {
    return storeErrorResponse(e);
  }
}

/** Admin: delete one record (?id=). */
export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Не указан id." }, { status: 400 });
  try {
    const removed = await getBenchmarkStore().remove(id);
    return removed ? new Response(null, { status: 204 }) : Response.json({ error: "Запись не найдена." }, { status: 404 });
  } catch (e) {
    return storeErrorResponse(e);
  }
}
