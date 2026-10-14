import { randomUUID } from "node:crypto";
import { badRequest, importSchema } from "@/lib/fps-engine/api-schemas";
import { SOURCE_IDS } from "@/lib/fps-engine/sources";
import { getBenchmarkStore, storeErrorResponse } from "@/lib/fps-engine/store";
import { IMPORT_LIMITS, parseCsv, previewImport } from "@/lib/fps-engine/validation";
import { readLimitedText, requireAdmin } from "@/lib/server/admin-auth";

/** Game/GPU pairs mentioned in the payload, to fetch only the records that could be duplicates. */
function pairsOf(format: "csv" | "json", content: string) {
  try {
    const rows = (format === "csv" ? parseCsv(content) : JSON.parse(content)) as { game_id?: unknown; gpu_id?: unknown }[];
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((r) => (r && typeof r.game_id === "string" && typeof r.gpu_id === "string" ? [{ gameId: r.game_id, gpuId: r.gpu_id }] : [])).slice(0, IMPORT_LIMITS.maxRows);
  } catch {
    return [];
  }
}

/**
 * Admin import (CSV or JSON). mode "preview" validates and reports without writing;
 * mode "commit" stores the valid, non-duplicate rows as one batch (rollback unit), unverified.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const body = await readLimitedText(request, IMPORT_LIMITS.maxBytes + 10_000);
  if (!body.ok) return body.response;
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return Response.json({ error: "Ожидается JSON: { format, content, mode }." }, { status: 400 });
  }
  const parsed = importSchema.safeParse(json);
  if (!parsed.success) return badRequest(parsed.error);
  const { format, content, mode, sourceId, notes } = parsed.data;
  if (!SOURCE_IDS.has(sourceId)) return Response.json({ error: `Неизвестный источник: ${sourceId}` }, { status: 422 });

  try {
    const store = getBenchmarkStore();
    let preview;
    try {
      preview = previewImport({ format, content }, await store.similar(pairsOf(format, content)), SOURCE_IDS, () => randomUUID());
    } catch (e) {
      if (e instanceof Error && "status" in e) throw e;
      return Response.json({ error: e instanceof Error ? e.message : "Не удалось разобрать файл." }, { status: 422 });
    }
    const report = { total: preview.total, valid: preview.valid.length, errors: preview.errors, duplicates: preview.duplicates };
    if (mode === "preview") return Response.json({ ...report, sample: preview.valid.slice(0, 20) });
    if (preview.valid.length === 0) return Response.json({ ...report, error: "Нет корректных строк для импорта." }, { status: 422 });
    const result = await store.insertBatch(
      preview.valid.map((v) => ({ ...v.record, sourceId: v.record.sourceId ?? sourceId })),
      { id: randomUUID(), sourceId, createdAt: new Date().toISOString(), rowCount: preview.valid.length, status: "committed", notes },
    );
    return Response.json({ ...report, valid: result.inserted, skippedDuplicates: result.skippedDuplicates, batchId: result.batch.id }, { status: 201 });
  } catch (e) {
    return storeErrorResponse(e);
  }
}
