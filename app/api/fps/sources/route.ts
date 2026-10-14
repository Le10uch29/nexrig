import { connection } from "next/server";
import { getBenchmarkStore } from "@/lib/fps-engine/store";
import { activeSources, MODEL_SOURCE } from "@/lib/fps-engine/sources";

/** Live status of every FPS data source. Statuses are checked on each request, never assumed. */
export async function GET() {
  // Never prerender: a status frozen at build time would misreport the sources.
  await connection();
  const store = getBenchmarkStore();
  const adapters = activeSources(store);
  const items = await Promise.all(
    adapters.map(async (a) => {
      const s = await a.getSourceStatus();
      return { ...a.info, ...s, lastErrorAt: s.status === "error" ? new Date().toISOString() : a.info.lastErrorAt };
    }),
  );
  const verified = await store.count({ verification: "verified" }).catch(() => null);
  return Response.json({ items: [...items, MODEL_SOURCE], verifiedRecords: verified, storage: store.kind }, { headers: { "Cache-Control": "no-store" } });
}
