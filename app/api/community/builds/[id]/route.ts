import { z } from "zod";
import { currentViewer, guarded, respond, writeGuard } from "@/lib/community/http";
import { getBuildThread, setBuildHidden, unpublishBuild } from "@/lib/community/service";
import { getCommunityStore } from "@/lib/community/store";

type Ctx = { params: Promise<{ id: string }> };

/** GET — the build with its comments; PATCH {hidden} — admin moderation; DELETE — unpublish (owner or admin). */
export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return guarded(async () => respond(await getBuildThread(getCommunityStore(), await currentViewer(), id)));
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await writeGuard(request, { maxBytes: 1_000 });
  if (!g.ok) return g.response;
  const parsed = z.object({ hidden: z.boolean() }).safeParse(g.json);
  if (!parsed.success) return Response.json({ error: "Ожидается { hidden: boolean }." }, { status: 400 });
  return guarded(async () => respond(await setBuildHidden(getCommunityStore(), g.viewer, id, parsed.data.hidden)));
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await writeGuard(request, { body: false });
  if (!g.ok) return g.response;
  return guarded(async () => respond(await unpublishBuild(getCommunityStore(), g.viewer, id)));
}
