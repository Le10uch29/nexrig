import { guarded, respond, writeGuard } from "@/lib/community/http";
import { addComment } from "@/lib/community/service";
import { getCommunityStore } from "@/lib/community/store";

/** POST { body, nickname, parentId? } — comment on a build or reply to another comment. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await writeGuard(request, { maxBytes: 8_000 });
  if (!g.ok) return g.response;
  return guarded(async () => respond(await addComment(getCommunityStore(), g.viewer, id, g.json), 201));
}
