import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SELECTION } from "@/data/default-build";
import type { BuildSelection } from "@/types/build";

const DIR = mkdtempSync(join(tmpdir(), "nexrig-community-"));
process.env.NEXRIG_COMMUNITY_STORE = join(DIR, "community.json");
process.env.NEXRIG_BENCHMARK_STORE = join(DIR, "fps.json");
process.env.NEXRIG_BENCHMARK_BACKEND = "file";

const ALICE = { id: "11111111-1111-4111-8111-111111111111", isAdmin: false };
const BOB = { id: "22222222-2222-4222-8222-222222222222", isAdmin: false };
const ADMIN = { id: "33333333-3333-4333-8333-333333333333", isAdmin: true };
const selection: BuildSelection = { ...DEFAULT_SELECTION, gpu: "nvidia-founders-edition-rtx-4070" };

const load = async () => {
  const svc = await import("@/lib/community/service");
  const { getCommunityStore } = await import("@/lib/community/store");
  return { ...svc, store: getCommunityStore() };
};

const publishAs = async (viewer: typeof ALICE, patch: Record<string, unknown> = {}) => {
  const { publishBuild, store } = await load();
  return publishBuild(store, viewer, { name: "Игровой ПК", description: "Для 1440p", nickname: "Alice", selection, ...patch });
};

describe("community: publishing builds", () => {
  it("requires sign-in and validates nickname, text and the selection", async () => {
    const { publishBuild, store } = await load();
    expect(await publishBuild(store, null, {})).toMatchObject({ ok: false, status: 401 });
    expect(await publishAs(ALICE, { nickname: "a" })).toMatchObject({ ok: false, status: 400 });
    expect(await publishAs(ALICE, { nickname: "Админ" })).toMatchObject({ ok: false, status: 400 });
    expect(await publishAs(ALICE, { nickname: "<script>" })).toMatchObject({ ok: false, status: 400 });
    expect(await publishAs(ALICE, { name: "x" })).toMatchObject({ ok: false, status: 400 });
    expect(await publishAs(ALICE, { selection: { ...selection, gpu: "fake-gpu" } })).toMatchObject({ ok: false, status: 422 });
    expect(await publishAs(ALICE, { selection: { ...selection, gpu: selection.cpu } })).toMatchObject({ ok: false, status: 422 }); // CPU in the GPU slot
    expect(await publishAs(ALICE, { selection: { ...selection, gpu: null } })).toMatchObject({ ok: false, status: 422 });
  });

  it("computes the price on the server and never exposes the owner id", async () => {
    const { listBuilds, store } = await load();
    const { resolveBuild, totalPrice } = await import("@/lib/hardware/repository");
    const res = await publishAs(ALICE, { totalPriceRub: 1, description: "Тест\u0007\n\n\n\nдальше" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.totalPriceRub).toBe(totalPrice(resolveBuild(selection)));
    expect(res.value.description).toBe("Тест\n\nдальше"); // control chars dropped, blank lines collapsed
    expect(res.value.mine).toBe(true);
    const list = await listBuilds(store, null);
    expect(list.ok && list.value.items.length).toBeGreaterThan(0);
    const json = JSON.stringify(list);
    expect(json).not.toContain(ALICE.id);
    expect(list.ok && list.value.items[0].author).toMatchObject({ name: "Alice", isAdmin: false });
    expect(list.ok && list.value.items[0].mine).toBe(false); // anonymous viewer
  });

  it("limits how many builds one user keeps published", async () => {
    const { MAX_PUBLIC_BUILDS, store } = await load();
    const heavy = { id: "44444444-4444-4444-8444-444444444444", isAdmin: false };
    for (let i = 0; i < MAX_PUBLIC_BUILDS; i++) expect((await publishAs(heavy, { name: `Сборка ${i}` })).ok).toBe(true);
    expect(await publishAs(heavy)).toMatchObject({ ok: false, status: 429 });
    expect(await store.countPublicBuilds(heavy.id)).toBe(MAX_PUBLIC_BUILDS);
  });
});

describe("community: comments", () => {
  it("lets users comment on others' builds and reply to each other", async () => {
    const { addComment, getBuildThread, store } = await load();
    const b = await publishAs(ALICE);
    if (!b.ok) throw new Error("publish failed");
    const c1 = await addComment(store, BOB, b.value.id, { body: "Отличная сборка, но блок питания впритык?", nickname: "Bob" });
    expect(c1).toMatchObject({ ok: true });
    if (!c1.ok) return;
    const reply = await addComment(store, ALICE, b.value.id, { body: "Хватает с запасом 20%.", nickname: "Alice", parentId: c1.value.id });
    expect(reply.ok && reply.value.parentId).toBe(c1.value.id);
    const thread = await getBuildThread(store, null, b.value.id);
    expect(thread.ok && thread.value.comments.map((c) => c.author.name)).toEqual(["Bob", "Alice"]);
    expect(thread.ok && thread.value.build.commentCount).toBe(2);
    expect(JSON.stringify(thread)).not.toContain(BOB.id);

    expect(await addComment(store, null, b.value.id, { body: "x", nickname: "Anon" })).toMatchObject({ ok: false, status: 401 });
    expect(await addComment(store, BOB, b.value.id, { body: "   ", nickname: "Bob" })).toMatchObject({ ok: false, status: 400 });
    expect(await addComment(store, BOB, "00000000-0000-4000-8000-000000000000", { body: "hi", nickname: "Bob" })).toMatchObject({ ok: false, status: 404 });
    // A reply must point to a comment of the same build.
    const other = await publishAs(BOB, { nickname: "Bob" });
    if (!other.ok) throw new Error("publish failed");
    expect(await addComment(store, BOB, other.value.id, { body: "hi", nickname: "Bob", parentId: c1.value.id })).toMatchObject({ ok: false, status: 422 });
  });

  it("only the author or an admin can delete; admins can hide; hidden text is not shown to others", async () => {
    const { addComment, deleteComment, setCommentHidden, getBuildThread, store } = await load();
    const b = await publishAs(ALICE);
    if (!b.ok) throw new Error("publish failed");
    const c = await addComment(store, BOB, b.value.id, { body: "Спорный комментарий", nickname: "Bob" });
    if (!c.ok) throw new Error("comment failed");
    expect(await deleteComment(store, ALICE, c.value.id)).toMatchObject({ ok: false, status: 403 });
    expect(await setCommentHidden(store, ALICE, c.value.id, true)).toMatchObject({ ok: false, status: 403 });
    expect(await setCommentHidden(store, ADMIN, c.value.id, true)).toMatchObject({ ok: true });
    const forUser = await getBuildThread(store, ALICE, b.value.id);
    expect(forUser.ok && forUser.value.comments[0]).toMatchObject({ hidden: true, body: "" });
    expect(forUser.ok && forUser.value.build.commentCount).toBe(0);
    const forAdmin = await getBuildThread(store, ADMIN, b.value.id);
    expect(forAdmin.ok && forAdmin.value.comments[0].body).toBe("Спорный комментарий");
    // Cannot reply to a hidden comment.
    expect(await addComment(store, ALICE, b.value.id, { body: "ответ", nickname: "Alice", parentId: c.value.id })).toMatchObject({ ok: false, status: 422 });

    const own = await addComment(store, BOB, b.value.id, { body: "Удалю позже", nickname: "Bob" });
    if (!own.ok) throw new Error("comment failed");
    expect(await deleteComment(store, BOB, own.value.id)).toMatchObject({ ok: true });
    const after = await getBuildThread(store, null, b.value.id);
    expect(after.ok && after.value.comments.find((x) => x.id === own.value.id)).toMatchObject({ deleted: true, body: "" });
  });

  it("caps comments per hour per user", async () => {
    const { addComment, MAX_COMMENTS_PER_HOUR, store } = await load();
    const b = await publishAs(ALICE);
    if (!b.ok) throw new Error("publish failed");
    const spammer = { id: "55555555-5555-4555-8555-555555555555", isAdmin: false };
    for (let i = 0; i < MAX_COMMENTS_PER_HOUR; i++) expect((await addComment(store, spammer, b.value.id, { body: `сообщение ${i}`, nickname: "Spam" })).ok).toBe(true);
    expect(await addComment(store, spammer, b.value.id, { body: "ещё", nickname: "Spam" })).toMatchObject({ ok: false, status: 429 });
  });
});

describe("community: unpublishing and moderation of builds", () => {
  it("owner unpublishes; others cannot; admin hides from everyone but the owner", async () => {
    const { unpublishBuild, setBuildHidden, getBuildThread, addComment, store } = await load();
    const b = await publishAs(ALICE);
    if (!b.ok) throw new Error("publish failed");
    expect(await unpublishBuild(store, BOB, b.value.id)).toMatchObject({ ok: false, status: 403 });
    expect(await setBuildHidden(store, BOB, b.value.id, true)).toMatchObject({ ok: false, status: 403 });
    expect(await setBuildHidden(store, ADMIN, b.value.id, true)).toMatchObject({ ok: true });
    expect(await getBuildThread(store, BOB, b.value.id)).toMatchObject({ ok: false, status: 404 });
    expect(await getBuildThread(store, null, b.value.id)).toMatchObject({ ok: false, status: 404 });
    expect(await getBuildThread(store, ALICE, b.value.id)).toMatchObject({ ok: true });
    expect(await getBuildThread(store, ADMIN, b.value.id)).toMatchObject({ ok: true });
    expect(await addComment(store, BOB, b.value.id, { body: "hi", nickname: "Bob" })).toMatchObject({ ok: false, status: 404 });

    const b2 = await publishAs(ALICE);
    if (!b2.ok) throw new Error("publish failed");
    expect(await unpublishBuild(store, ALICE, b2.value.id)).toMatchObject({ ok: true });
    expect(await getBuildThread(store, ALICE, b2.value.id)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("community: API routes", () => {
  it("requires sign-in for writes and lists builds publicly", async () => {
    const list = await import("@/app/api/community/builds/route");
    expect((await list.POST(new Request("http://x/api/community/builds", { method: "POST", headers: { origin: "http://x", host: "x" }, body: "{}" }))).status).toBe(401);
    const res = await list.GET(new Request("http://x/api/community/builds"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
    expect((await list.GET(new Request("http://x/api/community/builds?mine=1"))).status).toBe(401);

    const comments = await import("@/app/api/community/builds/[id]/comments/route");
    const ctx = { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) };
    expect((await comments.POST(new Request("http://x", { method: "POST", headers: { origin: "http://x", host: "x" }, body: "{}" }), ctx)).status).toBe(401);
    const one = await import("@/app/api/community/builds/[id]/route");
    expect((await one.GET(new Request("http://x"), ctx)).status).toBe(404);
  });

  it("rejects cross-origin writes even when signed in", async () => {
    const { writeGuard } = await import("@/lib/community/http");
    const g = await writeGuard(new Request("http://x", { method: "POST", headers: { origin: "https://evil.example", host: "x" }, body: "{}" }), { viewer: ALICE });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(403);
  });
});

describe("community: migration 20261017000000", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261017000000_community_builds.sql"), "utf8").toLowerCase();
  it("reuses saved_builds, keeps comments server-only and removes direct writes", () => {
    expect(sql).toContain("alter table public.saved_builds");
    expect(sql).not.toMatch(/create table if not exists public\.(community_)?builds\b/);
    expect(sql).toContain("revoke all on public.build_comments from anon, authenticated;");
    expect(sql).toContain("revoke insert, update, delete, truncate, trigger, references on public.saved_builds from anon, authenticated;");
    expect(sql).toContain("alter table public.build_comments enable row level security;");
    expect(sql.split("\n").filter((l) => l.trim().startsWith("grant "))).toHaveLength(0);
  });
});
