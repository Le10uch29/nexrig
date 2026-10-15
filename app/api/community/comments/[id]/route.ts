import { z } from "zod";
import { guarded, respond, writeGuard } from "@/lib/community/http";
import { deleteComment, setCommentHidden } from "@/lib/community/service";
import { getCommunityStore } from "@/lib/community/store";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE — the author (or an admin) deletes a comment; PATCH {hidden} — admin moderation. */
export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await writeGuard(request, { body: false });
  if (!g.ok) return g.response;
  return guarded(async () => respond(await deleteComment(getCommunityStore(), g.viewer, id)));
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await writeGuard(request, { maxBytes: 1_000 });
  if (!g.ok) return g.response;
  const parsed = z.object({ hidden: z.boolean() }).safeParse(g.json);
  if (!parsed.success) return Response.json({ error: "Ожидается { hidden: boolean }." }, { status: 400 });
  return guarded(async () => respond(await setCommentHidden(getCommunityStore(), g.viewer, id, parsed.data.hidden)));
}
