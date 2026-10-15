"use client";

import { useRouter } from "next/navigation";
import { usePrice } from "@/features/settings/currency";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useBuildStore } from "@/features/build-state/store";
import { hardwareRepository } from "@/lib/hardware/repository";
import { useMessages } from "@/lib/i18n";
import { ComponentThumb } from "@/components/hardware/ComponentThumb";
import { IconSearch } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";

/** Combobox over the hardware repository. Ctrl/⌘+K focuses it from anywhere. */
export function GlobalSearch() {
  const formatPrice = usePrice();
  const t = useMessages();
  const router = useRouter();
  const openCatalog = useBuildStore((s) => s.openCatalog);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => hardwareRepository.search(q, 8), [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const choose = (i: number) => {
    const c = results[i];
    if (!c) return;
    openCatalog(c.category, c.id);
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
    router.push("/builder");
  };

  return (
    <div className="relative">
      {/* Phones: an icon that expands into a full-width field while focused; wider screens: a field. */}
      <label className="flex h-9 w-9 items-center gap-2 rounded-[var(--radius-md)] border border-line bg-panel px-2.5 focus-within:border-violet/60 max-sm:focus-within:fixed max-sm:focus-within:inset-x-3 max-sm:focus-within:top-[9px] max-sm:focus-within:z-50 max-sm:focus-within:w-auto sm:w-[min(42vw,300px)] lg:w-40 xl:w-[300px]">
        <IconSearch className="shrink-0 text-fg-3" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open && q.length > 0}
          aria-controls={listId}
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          aria-label={t.nav.search}
          placeholder={t.nav.search}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              choose(active);
            } else if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-3"
        />
        <kbd className="hidden rounded border border-line px-1.5 text-[10px] text-fg-3 sm:inline lg:hidden xl:inline">{t.nav.searchShortcut}</kbd>
      </label>
      {open && q.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="animate-in absolute right-0 z-50 mt-2 max-h-96 w-[min(92vw,380px)] max-sm:fixed max-sm:inset-x-3 max-sm:top-[52px] max-sm:w-auto overflow-auto rounded-[var(--radius-lg)] border border-line-strong bg-panel p-1.5 shadow-pop scroll-thin"
        >
          {results.length === 0 && <li className="px-3 py-4 text-center text-xs text-fg-3">{t.catalog.empty}</li>}
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              onMouseEnter={() => setActive(i)}
              className={cx("flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-2 py-1.5", i === active && "bg-panel-3")}
            >
              <ComponentThumb component={c} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{c.name}</p>
                <p className="text-[11px] text-fg-3">{t.categories[c.category]}</p>
              </div>
              <span className="num text-xs text-fg-2">{formatPrice(c.price.amountRub)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
