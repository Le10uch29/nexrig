"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { useAuth, useAuthDialog } from "@/features/auth/use-auth";
import { useBuildStore } from "@/features/build-state/store";
import { usePrice } from "@/features/settings/currency";
import { checkBuild } from "@/features/compatibility/engine";
import type { BuildComment, CommunityBuild } from "@/lib/community/types";
import { NICKNAME_RULE } from "@/lib/community/validation";
import { resolveBuild, totalPrice } from "@/lib/hardware/repository";
import { useMessages } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, Button, cx, EmptyState, inputCls, StatusPill } from "@/components/ui/primitives";

/* ------------------------------------------------------------------ small client stores */

const NICK_KEY = "nexrig.community.nickname";
const nickListeners = new Set<() => void>();
const nickStore = {
  subscribe: (fn: () => void) => (nickListeners.add(fn), () => void nickListeners.delete(fn)),
  get: () => {
    try {
      return localStorage.getItem(NICK_KEY) ?? "";
    } catch {
      return "";
    }
  },
  set: (v: string) => {
    try {
      localStorage.setItem(NICK_KEY, v);
    } catch {
      /* not kept between visits */
    }
    nickListeners.forEach((fn) => fn());
  },
};
const useNickname = () => useSyncExternalStore(nickStore.subscribe, nickStore.get, () => "");

/** Selected build in the URL hash (#build=<id>), so a build can be linked. */
const hashSubscribe = (fn: () => void) => {
  window.addEventListener("hashchange", fn);
  return () => window.removeEventListener("hashchange", fn);
};
const useSelectedBuild = () =>
  useSyncExternalStore(
    hashSubscribe,
    () => new URLSearchParams(window.location.hash.slice(1)).get("build"),
    () => null,
  );
const selectBuild = (id: string | null) => {
  window.location.hash = id ? `build=${id}` : "";
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, credentials: "same-origin" });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function AuthorLine({ a, at }: { a: CommunityBuild["author"]; at: string }) {
  return (
    <span className="text-[11.5px] text-fg-3">
      <span className="font-medium text-fg-2">{a.name}</span>
      <span className="num"> #{a.tag}</span>
      {a.isAdmin && <Badge tone="violet" className="ml-1">админ</Badge>} · {fmtDate(at)}
    </span>
  );
}

function NicknameField() {
  const nickname = useNickname();
  return (
    <label className="block text-[11px] text-fg-3">
      Ваш ник (виден другим)
      <input className={cx(inputCls, "mt-1")} value={nickname} maxLength={32} onChange={(e) => nickStore.set(e.target.value)} placeholder="например, Shadow_PC" />
      <span className="mt-0.5 block text-[10.5px]">{NICKNAME_RULE} Почта и id аккаунта не показываются.</span>
    </label>
  );
}

/* ------------------------------------------------------------------ publish */

function PublishPanel({ onPublished }: { onPublished: (b: CommunityBuild) => void }) {
  const auth = useAuth();
  const showAuth = useAuthDialog((s) => s.show);
  const selection = useBuildStore((s) => s.selection);
  const buildName = useBuildStore((s) => s.buildName);
  const nickname = useNickname();
  const formatPrice = usePrice();
  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const r = resolveBuild(selection);
  const ready = Boolean(r.cpu && r.gpu);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState({ busy: true, error: null });
    try {
      const b = await api<CommunityBuild>("/api/community/builds", { method: "POST", body: JSON.stringify({ name: name ?? buildName, description, nickname, selection }) });
      setDescription("");
      setState({ busy: false, error: null });
      onPublished(b);
    } catch (err) {
      setState({ busy: false, error: err instanceof Error ? err.message : "Не удалось опубликовать." });
    }
  };

  return (
    <section className="rounded-[var(--radius-lg)] border border-line bg-panel p-4">
      <h2 className="text-sm font-semibold">Поделиться текущей сборкой</h2>
      <p className="mt-0.5 text-[12px] text-fg-3">
        Публикуется сборка из 3D-конфигуратора: {r.cpu?.name ?? "процессор не выбран"} + {r.gpu?.name ?? "видеокарта не выбрана"}
        {ready && ` · ${formatPrice(totalPrice(r))}`}.
      </p>
      {auth.status !== "signed-in" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => showAuth("login")} disabled={auth.status === "unavailable" || auth.status === "loading"}>
            Войти, чтобы опубликовать
          </Button>
          <span className="text-[12px] text-fg-3">Смотреть сборки и комментарии можно без входа.</span>
        </div>
      ) : (
        <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={submit}>
          <div className="space-y-3">
            <label className="block text-[11px] text-fg-3">
              Название
              <input className={cx(inputCls, "mt-1")} value={name ?? buildName} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </label>
            <NicknameField />
          </div>
          <label className="block text-[11px] text-fg-3">
            Описание (для чего сборка, что важно, вопросы к сообществу)
            <textarea className={cx(inputCls, "mt-1 h-[132px] resize-y py-2")} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
            <span className="mt-0.5 block text-right text-[10.5px] num">{description.length}/2000</span>
          </label>
          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <Button type="submit" variant="primary" disabled={!ready || state.busy || nickname.trim().length < 2}>
              {state.busy ? "Публикация…" : "Опубликовать сборку"}
            </Button>
            {!ready && <span className="text-[12px] text-fg-3">Добавьте в конфигураторе процессор и видеокарту.</span>}
            {state.error && (
              <span className="text-[12px] text-bad" role="alert">
                {state.error}
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ list */

function BuildCard({ b, active }: { b: CommunityBuild; active: boolean }) {
  const formatPrice = usePrice();
  const r = resolveBuild(b.selection);
  const report = checkBuild(b.selection);
  return (
    <button
      type="button"
      onClick={() => selectBuild(b.id)}
      aria-pressed={active}
      className={cx("w-full rounded-[var(--radius-md)] border p-3 text-left transition-colors", active ? "border-violet/50 bg-violet-soft/30" : "border-line bg-panel hover:border-line-strong")}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13.5px] font-semibold">{b.name}</p>
        <span className="num shrink-0 text-[12px] text-fg-2">{formatPrice(b.totalPriceRub)}</span>
      </div>
      <p className="mt-0.5 truncate text-[12px] text-fg-2">
        {r.cpu?.name ?? "—"} · {r.gpu?.name ?? "—"}
        {r.ram ? ` · ${r.ramCount}×${r.ram.moduleSizeGb} ГБ ${r.ram.type}` : ""}
      </p>
      {b.description && <p className="mt-1 line-clamp-2 text-[12px] whitespace-pre-line text-fg-3">{b.description}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <AuthorLine a={b.author} at={b.publishedAt} />
        <StatusPill status={report.overall} size="xs" />
        <span className="text-[11.5px] text-fg-3">комментариев: {b.commentCount}</span>
        {b.hidden && <Badge tone="warn">скрыта модератором</Badge>}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ thread */

type Node = BuildComment & { children: Node[] };

function toTree(comments: BuildComment[]): Node[] {
  const byId = new Map(comments.map((c) => [c.id, { ...c, children: [] as Node[] }]));
  const roots: Node[] = [];
  for (const n of byId.values()) {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  return roots;
}

function CommentForm({ buildId, parentId, onDone, compact }: { buildId: string; parentId?: string; onDone: () => void; compact?: boolean }) {
  const nickname = useNickname();
  const [body, setBody] = useState("");
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState({ busy: true, error: null });
    try {
      await api(`/api/community/builds/${buildId}/comments`, { method: "POST", body: JSON.stringify({ body, nickname, parentId: parentId ?? null }) });
      setBody("");
      setState({ busy: false, error: null });
      onDone();
    } catch (err) {
      setState({ busy: false, error: err instanceof Error ? err.message : "Не удалось отправить." });
    }
  };
  return (
    <form onSubmit={submit} className="space-y-1.5">
      <textarea
        className={cx(inputCls, "resize-y py-2", compact ? "h-16" : "h-20")}
        value={body}
        maxLength={2000}
        onChange={(e) => setBody(e.target.value)}
        placeholder={parentId ? "Ваш ответ…" : "Ваш комментарий к сборке…"}
        aria-label={parentId ? "Ответ на комментарий" : "Комментарий"}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={state.busy || !body.trim() || nickname.trim().length < 2}>
          {parentId ? "Ответить" : "Отправить"}
        </Button>
        {nickname.trim().length < 2 && <span className="text-[11px] text-fg-3">Укажите ник выше.</span>}
        {state.error && (
          <span className="text-[11.5px] text-bad" role="alert">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

function CommentItem({ n, depth, buildId, canWrite, isAdmin, reload }: { n: Node; depth: number; buildId: string; canWrite: boolean; isAdmin: boolean; reload: () => void }) {
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (path: string, init: RequestInit) => {
    try {
      await api(path, init);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    }
  };
  return (
    <li className={cx(depth > 0 && "border-l border-line pl-3")}>
      <div className="rounded-[var(--radius-sm)] py-1.5">
        <AuthorLine a={n.author} at={n.createdAt} />
        {n.deleted ? (
          <p className="mt-0.5 text-[12.5px] text-fg-3 italic">Комментарий удалён автором.</p>
        ) : n.hidden && !n.body ? (
          <p className="mt-0.5 text-[12.5px] text-fg-3 italic">Скрыт модератором.</p>
        ) : (
          <p className={cx("mt-0.5 text-[13px] whitespace-pre-line break-words", n.hidden && "opacity-60")}>
            {n.body}
            {n.hidden && <Badge tone="warn" className="ml-1">скрыт</Badge>}
            {n.edited && <span className="ml-1 text-[11px] text-fg-3">(изменён)</span>}
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {canWrite && !n.deleted && !n.hidden && (
            <Button size="sm" variant="ghost" onClick={() => setReplying((v) => !v)}>
              {replying ? "Отмена" : "Ответить"}
            </Button>
          )}
          {n.mine && !n.deleted && (
            <Button size="sm" variant="ghost" onClick={() => window.confirm("Удалить комментарий?") && act(`/api/community/comments/${n.id}`, { method: "DELETE" })}>
              Удалить
            </Button>
          )}
          {isAdmin && !n.deleted && (
            <Button size="sm" variant="ghost" onClick={() => act(`/api/community/comments/${n.id}`, { method: "PATCH", body: JSON.stringify({ hidden: !n.hidden }) })}>
              {n.hidden ? "Показать" : "Скрыть"}
            </Button>
          )}
        </div>
        {error && <p className="text-[11.5px] text-bad">{error}</p>}
        {replying && (
          <div className="mt-1.5">
            <CommentForm
              buildId={buildId}
              parentId={n.id}
              compact
              onDone={() => {
                setReplying(false);
                reload();
              }}
            />
          </div>
        )}
      </div>
      {n.children.length > 0 && (
        <ul className={cx("mt-1 space-y-1", depth >= 3 ? "" : "ml-2")}>
          {n.children.map((c) => (
            <CommentItem key={c.id} n={c} depth={Math.min(depth + 1, 3)} buildId={buildId} canWrite={canWrite} isAdmin={isAdmin} reload={reload} />
          ))}
        </ul>
      )}
    </li>
  );
}

function BuildDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const t = useMessages();
  const router = useRouter();
  const auth = useAuth();
  const showAuth = useAuthDialog((s) => s.show);
  const loadSelection = useBuildStore((s) => s.loadSelection);
  const formatPrice = usePrice();
  const [data, setData] = useState<{ id: string; build: CommunityBuild; comments: BuildComment[] } | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/community/builds/${encodeURIComponent(id)}`, { signal: ctrl.signal, credentials: "same-origin" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
        setData({ id, ...(body as { build: CommunityBuild; comments: BuildComment[] }) });
        setError(null);
      })
      .catch((e: Error) => !ctrl.signal.aborted && setError({ id, message: e.message }));
    return () => ctrl.abort();
  }, [id, nonce]);
  const reload = () => {
    setNonce((n) => n + 1);
    onChanged();
  };
  if (error?.id === id) return <EmptyState title="Сборка недоступна">{error.message}</EmptyState>;
  if (!data || data.id !== id) return <p className="text-[12px] text-fg-3">Загрузка…</p>;
  const { build: b, comments } = data;
  const r = resolveBuild(b.selection);
  const report = checkBuild(b.selection);
  const isAdmin = Boolean(auth.user?.isAdmin);
  const canWrite = auth.status === "signed-in";
  const parts = [r.case, r.motherboard, r.cpu, r.cooler, r.ram, r.gpu, ...r.storage, r.psu, r.fans].filter((c): c is NonNullable<typeof c> => Boolean(c));
  const moderate = async (init: RequestInit, after?: () => void) => {
    try {
      await api(`/api/community/builds/${b.id}`, init);
      after?.();
      reload();
    } catch (e) {
      setError({ id, message: e instanceof Error ? e.message : "Ошибка" });
    }
  };
  return (
    <article className="space-y-4">
      <header className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-lg font-semibold">{b.name}</h2>
          <span className="num text-sm text-fg-2">{formatPrice(b.totalPriceRub)}</span>
        </div>
        <AuthorLine a={b.author} at={b.publishedAt} />
        {b.hidden && <p className="text-[12px] text-warn">Сборка скрыта модератором — её видите только вы{isAdmin ? " и администраторы" : ""}.</p>}
      </header>
      {b.description && <p className="text-[13px] leading-relaxed whitespace-pre-line break-words text-fg-2">{b.description}</p>}
      <div className="rounded-[var(--radius-md)] border border-line p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Комплектующие</p>
          <StatusPill status={report.overall} size="xs" />
        </div>
        <ul className="space-y-1 text-[12.5px]">
          {parts.map((c) => (
            <li key={`${c.category}-${c.id}`} className="flex justify-between gap-3">
              <span className="text-fg-3">{t.categories[c.category]}</span>
              <span className="text-right">
                {c.category === "ram" && r.ramCount > 1 ? `${r.ramCount} × ` : ""}
                {c.name}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-fg-3">Цена — по демо-ценам каталога на момент публикации.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            loadSelection(b.selection, b.name);
            router.push("/builder");
          }}
        >
          Открыть в конструкторе
        </Button>
        {b.mine && (
          <Button size="sm" variant="danger" onClick={() => window.confirm("Снять сборку с публикации? Комментарии перестанут быть видны.") && moderate({ method: "DELETE" }, () => selectBuild(null))}>
            Снять с публикации
          </Button>
        )}
        {isAdmin && (
          <Button size="sm" onClick={() => moderate({ method: "PATCH", body: JSON.stringify({ hidden: !b.hidden }) })}>
            {b.hidden ? "Показать сборку" : "Скрыть сборку"}
          </Button>
        )}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Комментарии · {b.commentCount}</h3>
        {canWrite ? (
          <div className="space-y-2 rounded-[var(--radius-md)] border border-line p-3">
            <NicknameField />
            <CommentForm buildId={b.id} onDone={reload} />
          </div>
        ) : (
          <p className="text-[12px] text-fg-3">
            <button type="button" className="text-violet hover:underline" onClick={() => showAuth("login")}>
              Войдите
            </button>
            , чтобы комментировать и отвечать другим.
          </p>
        )}
        {comments.length === 0 ? (
          <p className="text-[12px] text-fg-3">Комментариев пока нет — будьте первым.</p>
        ) : (
          <ul className="space-y-1">
            {toTree(comments).map((n) => (
              <CommentItem key={n.id} n={n} depth={0} buildId={b.id} canWrite={canWrite} isAdmin={isAdmin} reload={reload} />
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

/* ------------------------------------------------------------------ page */

export function CommunityPage() {
  const auth = useAuth();
  const selected = useSelectedBuild();
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [list, setList] = useState<{ key: string; items: CommunityBuild[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const key = `${tab}|${page}|${nonce}`;
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/community/builds?page=${page}${tab === "mine" ? "&mine=1" : ""}`, { signal: ctrl.signal, credentials: "same-origin" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
        setList({ key, ...(body as { items: CommunityBuild[]; total: number; pageSize: number }) });
        setError(null);
      })
      .catch((e: Error) => !ctrl.signal.aborted && setError({ key, message: e.message }));
    return () => ctrl.abort();
  }, [key, page, tab]);
  const refresh = () => setNonce((n) => n + 1);
  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-4 px-4 py-6 md:px-6">
      <PageHeader section="Сообщество" title="Сборки пользователей" description="Публикуйте свою сборку, обсуждайте чужие и отвечайте на комментарии." />
      <PublishPanel
        onPublished={(b) => {
          setTab("all");
          setPage(1);
          refresh();
          selectBuild(b.id);
        }}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section className="space-y-2">
          <div className="flex items-center gap-1" role="tablist">
            {(
              [
                ["all", "Все сборки"],
                ["mine", "Мои"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                disabled={id === "mine" && auth.status !== "signed-in"}
                onClick={() => {
                  setTab(id);
                  setPage(1);
                }}
                className={cx("rounded-[var(--radius-sm)] px-3 py-1.5 text-[12.5px] disabled:opacity-40", tab === id ? "bg-panel-2 text-fg" : "text-fg-3 hover:text-fg")}
              >
                {label}
              </button>
            ))}
            {list && <span className="ml-auto text-[11.5px] text-fg-3">Всего: {list.total}</span>}
          </div>
          {error?.key === key ? (
            <EmptyState title="Не удалось загрузить сборки">{error.message}</EmptyState>
          ) : !list || list.key !== key ? (
            <p className="text-[12px] text-fg-3">Загрузка…</p>
          ) : list.items.length === 0 ? (
            <EmptyState title={tab === "mine" ? "Вы ещё ничего не публиковали" : "Пока нет ни одной сборки"}>Соберите ПК в конфигураторе и опубликуйте его выше.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {list.items.map((b) => (
                <li key={b.id}>
                  <BuildCard b={b} active={selected === b.id} />
                </li>
              ))}
            </ul>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-between text-[12px]">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Назад
              </Button>
              <span className="num text-fg-3">
                {page} / {pages}
              </span>
              <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Дальше
              </Button>
            </div>
          )}
        </section>
        <section className="rounded-[var(--radius-lg)] border border-line bg-panel p-4 lg:sticky lg:top-[calc(var(--nav-h)+16px)] lg:self-start">
          {selected ? <BuildDetail id={selected} onChanged={refresh} /> : <EmptyState title="Выберите сборку">Нажмите на сборку слева, чтобы открыть комплектующие и комментарии.</EmptyState>}
        </section>
      </div>
    </div>
  );
}
