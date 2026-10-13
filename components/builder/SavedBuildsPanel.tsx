"use client";

import { useRef, useState } from "react";
import { useSavedBuilds } from "@/features/build-state/saved-builds";
import { useBuildStore } from "@/features/build-state/store";
import { formatPrice, useMessages } from "@/lib/i18n";
import type { SavedBuild } from "@/types/build";
import { IconBookmark, IconDownload, IconTrash, IconUpload } from "@/components/ui/icons";
import { Button, EmptyState, inputCls } from "@/components/ui/primitives";

function download(build: SavedBuild) {
  const blob = new Blob([JSON.stringify({ name: build.name, selection: build.selection }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${build.name.replace(/[^\p{L}\p{N}_-]+/gu, "_")}.buildai.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function SavedBuildsPanel() {
  const t = useMessages();
  const builds = useSavedBuilds((s) => s.builds);
  const save = useSavedBuilds((s) => s.save);
  const update = useSavedBuilds((s) => s.update);
  const remove = useSavedBuilds((s) => s.remove);
  const duplicate = useSavedBuilds((s) => s.duplicate);
  const importJson = useSavedBuilds((s) => s.importJson);
  const selection = useBuildStore((s) => s.selection);
  const buildName = useBuildStore((s) => s.buildName);
  const loadSelection = useBuildStore((s) => s.loadSelection);
  const log = useBuildStore((s) => s.log);
  const [name, setName] = useState(buildName);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const b = save(name || buildName, selection);
          log("info", `Сборка «${b.name}» сохранена`);
          setMessage({ ok: true, text: `Сохранено: «${b.name}»` });
        }}
      >
        <label className="text-[11px] font-semibold tracking-wide text-fg-3 uppercase" htmlFor="save-name">
          {t.sidebar.buildName}
        </label>
        <div className="flex gap-2">
          <input id="save-name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={120} />
          <Button type="submit" variant="primary">
            <IconBookmark /> {t.actions.save}
          </Button>
        </div>
        <p className="text-[11px] text-fg-3">Хранится в localStorage этого браузера. Серверная база не подключена.</p>
      </form>

      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
          <IconUpload width={13} height={13} /> {t.actions.import}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const res = importJson(await f.text());
            setMessage(res.ok ? { ok: true, text: `Импортировано: «${res.build.name}»` } : { ok: false, text: res.error });
            e.target.value = "";
          }}
        />
      </div>
      {message && (
        <p role="status" className={message.ok ? "text-xs text-ok" : "text-xs text-bad"}>
          {message.text}
        </p>
      )}

      {builds.length === 0 ? (
        <EmptyState title="Сохранённых сборок нет" icon={<IconBookmark width={20} height={20} />}>
          Сохраните текущую конфигурацию, чтобы вернуться к ней или сравнить с другой.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {builds.map((b) => (
            <li key={b.id} className="rounded-[var(--radius-md)] border border-line bg-panel-2/50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{b.name}</p>
                  <p className="text-[11px] text-fg-3">{new Date(b.updatedAt).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}</p>
                </div>
                <p className="num shrink-0 text-xs">{formatPrice(b.totalPriceRub)}</p>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    loadSelection(b.selection, b.name);
                    setName(b.name);
                  }}
                >
                  {t.actions.load}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    update(b.id, selection, name || b.name);
                    setMessage({ ok: true, text: `Обновлено: «${name || b.name}»` });
                  }}
                  title="Перезаписать текущей конфигурацией"
                >
                  Перезаписать
                </Button>
                <Button size="sm" variant="ghost" onClick={() => duplicate(b.id)}>
                  {t.actions.duplicate}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => download(b)} aria-label={t.actions.export}>
                  <IconDownload width={13} height={13} />
                </Button>
                <Button size="sm" variant="danger" onClick={() => remove(b.id)} aria-label={t.actions.delete}>
                  <IconTrash width={13} height={13} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
