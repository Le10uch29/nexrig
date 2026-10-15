import { currentViewer, guarded, respond, writeGuard } from "@/lib/community/http";
import { listBuilds, publishBuild } from "@/lib/community/service";
import { getCommunityStore } from "@/lib/community/store";

/** GET ?page[&mine=1] — published builds; POST — publish a build (signed in). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = Math.min(1000, Math.max(1, Number(params.get("page")) || 1));
  return guarded(async () => respond(await listBuilds(getCommunityStore(), await currentViewer(), page, params.get("mine") === "1")));
}

export async function POST(request: Request) {
  const g = await writeGuard(request);
  if (!g.ok) return g.response;
  return guarded(async () => respond(await publishBuild(getCommunityStore(), g.viewer, g.json), 201));
}
