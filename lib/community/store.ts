import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { StoreError, supabaseConfig, type Page } from "@/lib/fps-engine/store";
import { createPostgrest } from "@/lib/server/postgrest";
import type { BuildSelection } from "@/types/build";

/**
 * Storage for community builds and comments. Same selection rules as the benchmark store:
 * Supabase (saved_builds + build_comments, migration 20261017000000) when the secret key is set;
 * a local JSON file in development; on Vercel without Supabase every call fails with a clear reason.
 */
export interface StoredBuild {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  selection: BuildSelection;
  totalPriceRub: number;
  authorName: string;
  authorIsAdmin: boolean;
  publishedAt: string;
  isPublic: boolean;
  hidden: boolean;
}

export interface StoredComment {
  id: string;
  buildId: string;
  parentId: string | null;
  authorId: string | null;
  authorName: string;
  authorIsAdmin: boolean;
  body: string;
  hidden: boolean;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BuildListFilter {
  /** Admins see hidden builds too. */
  includeHidden?: boolean;
  /** The owner sees their own hidden builds. */
  viewerId?: string | null;
  ownerId?: string;
}

export interface CommunityStore {
  kind: "supabase" | "file";
  listBuilds(filter: BuildListFilter, page?: number, pageSize?: number): Promise<Page<StoredBuild & { commentCount: number }>>;
  getBuild(id: string): Promise<StoredBuild | null>;
  countPublicBuilds(ownerId: string): Promise<number>;
  insertBuild(b: StoredBuild): Promise<void>;
  updateBuild(id: string, patch: { hidden?: boolean; isPublic?: boolean }): Promise<StoredBuild | null>;
  listComments(buildId: string): Promise<StoredComment[]>;
  getComment(id: string): Promise<StoredComment | null>;
  insertComment(c: StoredComment): Promise<void>;
  updateComment(id: string, patch: { hidden?: boolean; deleted?: boolean; body?: string }): Promise<StoredComment | null>;
  countCommentsSince(authorId: string, sinceIso: string): Promise<number>;
}

const visible = (b: StoredBuild, f: BuildListFilter) => b.isPublic && (!b.hidden || f.includeHidden || (f.viewerId && b.ownerId === f.viewerId)) && (!f.ownerId || b.ownerId === f.ownerId);

/* ------------------------------------------------------------------ file store (development) */

export function createFileCommunityStore(file: string): CommunityStore {
  let cache: { builds: StoredBuild[]; comments: StoredComment[] } | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  async function load() {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(await readFile(/*turbopackIgnore: true*/ file, "utf8"));
      cache = { builds: parsed.builds ?? [], comments: parsed.comments ?? [] };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new StoreError("Хранилище сообщества повреждено или недоступно.");
      cache = { builds: [], comments: [] };
    }
    return cache;
  }
  function mutate<T>(fn: (d: { builds: StoredBuild[]; comments: StoredComment[] }) => T): Promise<T> {
    const run = queue.then(async () => {
      const d = await load();
      const snapshot = structuredClone(d);
      const out = fn(d);
      try {
        await mkdir(/*turbopackIgnore: true*/ dirname(file), { recursive: true });
        await writeFile(/*turbopackIgnore: true*/ `${file}.tmp`, JSON.stringify(d, null, 1), "utf8");
        await rename(/*turbopackIgnore: true*/ `${file}.tmp`, /*turbopackIgnore: true*/ file);
      } catch {
        cache = snapshot;
        throw new StoreError("Не удалось сохранить: файловое хранилище недоступно для записи.");
      }
      return out;
    });
    queue = run.catch(() => undefined);
    return run;
  }
  const liveComments = (d: { comments: StoredComment[] }, buildId: string) => d.comments.filter((c) => c.buildId === buildId && !c.deleted && !c.hidden).length;
  return {
    kind: "file",
    async listBuilds(filter, page = 1, pageSize = 20) {
      const d = await load();
      const size = Math.min(50, Math.max(1, pageSize));
      const all = d.builds.filter((b) => visible(b, filter)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
      return { items: all.slice((page - 1) * size, page * size).map((b) => ({ ...b, commentCount: liveComments(d, b.id) })), total: all.length, page, pageSize: size };
    },
    async getBuild(id) {
      return (await load()).builds.find((b) => b.id === id) ?? null;
    },
    async countPublicBuilds(ownerId) {
      return (await load()).builds.filter((b) => b.ownerId === ownerId && b.isPublic).length;
    },
    insertBuild(b) {
      return mutate((d) => void d.builds.push(b));
    },
    updateBuild(id, patch) {
      return mutate((d) => {
        const b = d.builds.find((x) => x.id === id);
        if (!b) return null;
        Object.assign(b, patch);
        return b;
      });
    },
    async listComments(buildId) {
      return (await load()).comments.filter((c) => c.buildId === buildId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async getComment(id) {
      return (await load()).comments.find((c) => c.id === id) ?? null;
    },
    insertComment(c) {
      return mutate((d) => void d.comments.push(c));
    },
    updateComment(id, patch) {
      return mutate((d) => {
        const c = d.comments.find((x) => x.id === id);
        if (!c) return null;
        Object.assign(c, patch, { updatedAt: new Date().toISOString() });
        return c;
      });
    },
    async countCommentsSince(authorId, sinceIso) {
      return (await load()).comments.filter((c) => c.authorId === authorId && c.createdAt >= sinceIso).length;
    },
  };
}

/* ------------------------------------------------------------------ Supabase store */

type Row = Record<string, unknown>;
const enc = encodeURIComponent;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const buildFromRow = (x: Row): StoredBuild => ({
  id: String(x.id),
  ownerId: String(x.owner_id),
  name: String(x.name),
  description: String(x.description ?? ""),
  selection: x.selection as BuildSelection,
  totalPriceRub: Number(x.total_price ?? 0),
  authorName: String(x.author_name ?? ""),
  authorIsAdmin: Boolean(x.author_is_admin),
  publishedAt: String(x.published_at ?? x.created_at),
  isPublic: Boolean(x.is_public),
  hidden: Boolean(x.hidden),
});

const commentFromRow = (x: Row): StoredComment => ({
  id: String(x.id),
  buildId: String(x.build_id),
  parentId: x.parent_id ? String(x.parent_id) : null,
  authorId: x.author_id ? String(x.author_id) : null,
  authorName: String(x.author_name),
  authorIsAdmin: Boolean(x.author_is_admin),
  body: String(x.body),
  hidden: Boolean(x.hidden),
  deleted: Boolean(x.deleted),
  createdAt: String(x.created_at),
  updatedAt: String(x.updated_at),
});

export function createSupabaseCommunityStore(baseUrl: string, key: string): CommunityStore {
  const { call, json, total } = createPostgrest(baseUrl, key, "Сообщество не настроено: примените миграцию supabase/migrations/20261017000000_community_builds.sql.");
  const commentCountSelect = "build_comments(count)&build_comments.deleted=is.false&build_comments.hidden=is.false";
  return {
    kind: "supabase",
    async listBuilds(filter, page = 1, pageSize = 20) {
      const size = Math.min(50, Math.max(1, pageSize));
      const from = (page - 1) * size;
      const q = ["is_public=is.true"];
      if (filter.ownerId && UUID.test(filter.ownerId)) q.push(`owner_id=eq.${filter.ownerId}`);
      if (!filter.includeHidden) q.push(filter.viewerId && UUID.test(filter.viewerId) ? `or=(hidden.is.false,owner_id.eq.${filter.viewerId})` : "hidden=is.false");
      const res = await call(`saved_builds?select=*,${commentCountSelect}&${q.join("&")}&order=published_at.desc`, { range: `${from}-${from + size - 1}`, prefer: "count=exact" });
      const rows = await json<Row[]>(res);
      return {
        items: rows.map((r) => ({ ...buildFromRow(r), commentCount: Number((r.build_comments as { count?: number }[] | undefined)?.[0]?.count ?? 0) })),
        total: total(res),
        page,
        pageSize: size,
      };
    },
    async getBuild(id) {
      if (!UUID.test(id)) return null;
      const rows = await json<Row[]>(await call(`saved_builds?select=*&id=eq.${id}`));
      return rows[0] ? buildFromRow(rows[0]) : null;
    },
    async countPublicBuilds(ownerId) {
      if (!UUID.test(ownerId)) return 0;
      return total(await call(`saved_builds?select=id&owner_id=eq.${ownerId}&is_public=is.true`, { range: "0-0", prefer: "count=exact" }));
    },
    async insertBuild(b) {
      const row = {
        id: b.id,
        owner_id: b.ownerId,
        name: b.name,
        description: b.description,
        selection: b.selection,
        total_price: b.totalPriceRub,
        author_name: b.authorName,
        author_is_admin: b.authorIsAdmin,
        is_public: b.isPublic,
        hidden: b.hidden,
        published_at: b.publishedAt,
      };
      await call("saved_builds", { method: "POST", body: JSON.stringify(row), prefer: "return=minimal" });
    },
    async updateBuild(id, patch) {
      if (!UUID.test(id)) return null;
      const row: Row = { updated_at: new Date().toISOString() };
      if (patch.hidden !== undefined) row.hidden = patch.hidden;
      if (patch.isPublic !== undefined) row.is_public = patch.isPublic;
      const rows = await json<Row[]>(await call(`saved_builds?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(row), prefer: "return=representation" }));
      return rows[0] ? buildFromRow(rows[0]) : null;
    },
    async listComments(buildId) {
      if (!UUID.test(buildId)) return [];
      const rows = await json<Row[]>(await call(`build_comments?select=*&build_id=eq.${buildId}&order=created_at.asc`, { range: "0-999" }));
      return rows.map(commentFromRow);
    },
    async getComment(id) {
      if (!UUID.test(id)) return null;
      const rows = await json<Row[]>(await call(`build_comments?select=*&id=eq.${id}`));
      return rows[0] ? commentFromRow(rows[0]) : null;
    },
    async insertComment(c) {
      const row = { id: c.id, build_id: c.buildId, parent_id: c.parentId, author_id: c.authorId, author_name: c.authorName, author_is_admin: c.authorIsAdmin, body: c.body, hidden: c.hidden, deleted: c.deleted, created_at: c.createdAt };
      await call("build_comments", { method: "POST", body: JSON.stringify(row), prefer: "return=minimal" });
    },
    async updateComment(id, patch) {
      if (!UUID.test(id)) return null;
      const rows = await json<Row[]>(await call(`build_comments?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch), prefer: "return=representation" }));
      return rows[0] ? commentFromRow(rows[0]) : null;
    },
    async countCommentsSince(authorId, sinceIso) {
      if (!UUID.test(authorId)) return 0;
      return total(await call(`build_comments?select=id&author_id=eq.${authorId}&created_at=gte.${enc(sinceIso)}`, { range: "0-0", prefer: "count=exact" }));
    },
  };
}

function unconfigured(reason: string): CommunityStore {
  const fail = async (): Promise<never> => {
    throw new StoreError(reason);
  };
  return { kind: "file", listBuilds: fail, getBuild: fail, countPublicBuilds: fail, insertBuild: fail, updateBuild: fail, listComments: fail, getComment: fail, insertComment: fail, updateComment: fail, countCommentsSince: fail };
}

export function selectCommunityStore(env: Record<string, string | undefined> = process.env, cwd = process.cwd()): CommunityStore {
  const cfg = env.NEXRIG_BENCHMARK_BACKEND === "file" ? null : supabaseConfig(env);
  if (cfg) return createSupabaseCommunityStore(cfg.url, cfg.key);
  if (env.VERCEL) return unconfigured("Сообщество не настроено: на Vercel нужен Supabase (SUPABASE_SECRET_KEY и NEXT_PUBLIC_SUPABASE_URL).");
  return createFileCommunityStore(env.NEXRIG_COMMUNITY_STORE ?? join(cwd, ".data", "community.json"));
}

let selected: CommunityStore | null = null;
export function getCommunityStore(): CommunityStore {
  selected ??= selectCommunityStore();
  return selected;
}
