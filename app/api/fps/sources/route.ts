import { connection } from "next/server";
import { publicSources } from "@/lib/fps-engine/source-registry";
import { getBenchmarkStore } from "@/lib/fps-engine/store";

/** Live status of every FPS data source. Statuses are checked on each request, never assumed. */
export async function GET() {
  // Never prerender: a status frozen at build time would misreport the sources.
  await connection();
  return Response.json(await publicSources(getBenchmarkStore()), { headers: { "Cache-Control": "no-store" } });
}
