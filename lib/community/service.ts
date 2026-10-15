import "server-only";
import { randomUUID } from "node:crypto";
import { fingerprint } from "@/lib/fps-engine/analysis-stages";
import { resolveBuild, totalPrice } from "@/lib/hardware/repository";
import type { CommunityStore, StoredBuild, StoredComment } from "./store";
import type { BuildComment, CommunityAuthor, CommunityBuild } from "./types";
import { commentSchema, publishBuildSchema, selectionErrors } from "./validation";

/**
 * Community rules, independent of HTTP (used by the API routes and tests).
 *  - Anyone can read published, not hidden builds and their comments.
 *  - Signed-in users publish builds and comment on any visible build, including replies to other
 *    users' comments.
 *  - Authors unpublish their builds and delete their comments; admins hide either.
 *  - Owner and author ids never leave the server.
 */
export type Viewer = { id: string; isAdmin: boolean } | null;
export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

/** Builds a user may have published at once. */
export const MAX_PUBLIC_BUILDS = 20;
/** Comments a user may post per hour (counted in the database, so it holds across instances). */
export const MAX_COMMENTS_PER_HOUR = 30;

const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

export const authorTag = (id: string | null) => (id ? fingerprint(`author:${id}`).slice(-4).toUpperCase() : "----");

const author = (name: string, id: string | null, isAdmin: boolean): CommunityAuthor => ({ name, tag: authorTag(id), isAdmin });

export function toPublicBuild(b: StoredBuild & { commentCount?: number }, viewer: Viewer): CommunityBuild {
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    selection: b.selection,
    totalPriceRub: b.totalPriceRub,
    author: author(b.authorName, b.ownerId, b.authorIsAdmin),
    publishedAt: b.publishedAt,
    commentCount: b.commentCount ?? 0,
    hidden: b.hidden,
    mine: Boolean(viewer && viewer.id === b.ownerId),
  };
}

export function toPublicComment(c: StoredComment, viewer: Viewer): BuildComment {
  const showBody = !c.deleted && (!c.hidden || Boolean(viewer?.isAdmin));
  return {
    id: c.id,
    buildId: c.buildId,
    parentId: c.parentId,
    body: showBody ? c.body : "",
    author: author(c.authorName, c.authorId, c.authorIsAdmin),
    createdAt: c.createdAt,
    edited: !c.deleted && !c.hidden && Date.parse(c.updatedAt) - Date.parse(c.createdAt) > 1000,
    deleted: c.deleted,
    hidden: c.hidden,
    mine: Boolean(viewer && c.authorId === viewer.id),
  };
}

const canSee = (b: StoredBuild, viewer: Viewer) => b.isPublic && (!b.hidden || Boolean(viewer?.isAdmin) || viewer?.id === b.ownerId);

export async function listBuilds(store: CommunityStore, viewer: Viewer, page = 1, mineOnly = false) {
  if (mineOnly && !viewer) return fail(401, "Войдите, чтобы увидеть свои сборки.");
  const res = await store.listBuilds({ includeHidden: viewer?.isAdmin, viewerId: viewer?.id ?? null, ownerId: mineOnly ? viewer!.id : undefined }, page, 20);
  return { ok: true as const, value: { ...res, items: res.items.map((b) => toPublicBuild(b, viewer)) } };
}

export async function publishBuild(store: CommunityStore, viewer: Viewer, payload: unknown, now = new Date()): Promise<Outcome<CommunityBuild>> {
  if (!viewer) return fail(401, "Войдите, чтобы опубликовать сборку.");
  const parsed = publishBuildSchema.safeParse(payload);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Некорректные данные.");
  const { name, description, nickname, selection } = parsed.data;
  const errors = selectionErrors(selection);
  if (errors.length) return fail(422, errors[0]);
  if ((await store.countPublicBuilds(viewer.id)) >= MAX_PUBLIC_BUILDS) return fail(429, `Опубликовано уже ${MAX_PUBLIC_BUILDS} сборок — снимите старые с публикации.`);
  const build: StoredBuild = {
    id: randomUUID(),
    ownerId: viewer.id,
    name,
    description,
    selection,
    // Price is computed on the server from the catalogue, never taken from the client.
    totalPriceRub: totalPrice(resolveBuild(selection)),
    authorName: nickname,
    authorIsAdmin: viewer.isAdmin,
    publishedAt: now.toISOString(),
    isPublic: true,
    hidden: false,
  };
  await store.insertBuild(build);
  return { ok: true, value: toPublicBuild(build, viewer) };
}

export async function getBuildThread(store: CommunityStore, viewer: Viewer, id: string): Promise<Outcome<{ build: CommunityBuild; comments: BuildComment[] }>> {
  const b = await store.getBuild(id);
  if (!b || !canSee(b, viewer)) return fail(404, "Сборка не найдена.");
  const comments = await store.listComments(id);
  const live = comments.filter((c) => !c.deleted && !c.hidden).length;
  return { ok: true, value: { build: toPublicBuild({ ...b, commentCount: live }, viewer), comments: comments.map((c) => toPublicComment(c, viewer)) } };
}

/** Owner or admin: remove from the public list (the build is kept, not deleted). */
export async function unpublishBuild(store: CommunityStore, viewer: Viewer, id: string): Promise<Outcome<null>> {
  if (!viewer) return fail(401, "Войдите.");
  const b = await store.getBuild(id);
  if (!b || !b.isPublic) return fail(404, "Сборка не найдена.");
  if (b.ownerId !== viewer.id && !viewer.isAdmin) return fail(403, "Снять с публикации может только автор или администратор.");
  await store.updateBuild(id, { isPublic: false });
  return { ok: true, value: null };
}

export async function setBuildHidden(store: CommunityStore, viewer: Viewer, id: string, hidden: boolean): Promise<Outcome<null>> {
  if (!viewer?.isAdmin) return fail(403, "Только администратор может скрывать сборки.");
  const b = await store.updateBuild(id, { hidden });
  return b ? { ok: true, value: null } : fail(404, "Сборка не найдена.");
}

export async function addComment(store: CommunityStore, viewer: Viewer, buildId: string, payload: unknown, now = new Date()): Promise<Outcome<BuildComment>> {
  if (!viewer) return fail(401, "Войдите, чтобы комментировать.");
  const parsed = commentSchema.safeParse(payload);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Некорректный комментарий.");
  const b = await store.getBuild(buildId);
  if (!b || !b.isPublic || (b.hidden && !viewer.isAdmin)) return fail(404, "Сборка не найдена.");
  const parentId = parsed.data.parentId ?? null;
  if (parentId) {
    const parent = await store.getComment(parentId);
    if (!parent || parent.buildId !== buildId) return fail(422, "Комментарий, на который вы отвечаете, не найден.");
    if (parent.deleted || parent.hidden) return fail(422, "Нельзя ответить на удалённый или скрытый комментарий.");
  }
  const since = new Date(now.getTime() - 3600_000).toISOString();
  if ((await store.countCommentsSince(viewer.id, since)) >= MAX_COMMENTS_PER_HOUR) return fail(429, "Слишком много комментариев за час — попробуйте позже.");
  const c: StoredComment = {
    id: randomUUID(),
    buildId,
    parentId,
    authorId: viewer.id,
    authorName: parsed.data.nickname,
    authorIsAdmin: viewer.isAdmin,
    body: parsed.data.body,
    hidden: false,
    deleted: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await store.insertComment(c);
  return { ok: true, value: toPublicComment(c, viewer) };
}

/** The author deletes their comment (the text is removed; replies stay). */
export async function deleteComment(store: CommunityStore, viewer: Viewer, id: string): Promise<Outcome<null>> {
  if (!viewer) return fail(401, "Войдите.");
  const c = await store.getComment(id);
  if (!c || c.deleted) return fail(404, "Комментарий не найден.");
  if (c.authorId !== viewer.id && !viewer.isAdmin) return fail(403, "Удалить комментарий может только автор или администратор.");
  await store.updateComment(id, { deleted: true, body: "[удалено]" });
  return { ok: true, value: null };
}

export async function setCommentHidden(store: CommunityStore, viewer: Viewer, id: string, hidden: boolean): Promise<Outcome<null>> {
  if (!viewer?.isAdmin) return fail(403, "Только администратор может скрывать комментарии.");
  const c = await store.updateComment(id, { hidden });
  return c ? { ok: true, value: null } : fail(404, "Комментарий не найден.");
}
