"use client";

import { useEffect, useMemo, useState } from "react";
import { applyFacetPath, FACETS, facetOptions, pathFor } from "@/features/catalog/facets";
import { requestInstall } from "@/features/build-state/install-action";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { evaluateCandidate, type CandidateVerdict } from "@/features/compatibility/engine";
import { hardwareRepository } from "@/lib/hardware/repository";
import { perfKey } from "@/lib/hardware/specs";
import { collapseColorVariants, colorVariantsOf } from "@/lib/hardware/variants";
import { useMessages } from "@/lib/i18n";
import { CATEGORY_ORDER, type ComponentCategory, type HardwareComponent } from "@/types/hardware";
import { ComponentCard } from "@/components/hardware/ComponentCard";
import { ComponentThumb } from "@/components/hardware/ComponentThumb";
import { IconChevron, IconSearch } from "@/components/ui/icons";
import { Button, cx, EmptyState, inputCls, Select, Switch } from "@/components/ui/primitives";
import { FanLayoutEditor } from "./FanLayoutEditor";

type Sort = "price-asc" | "price-desc" | "perf" | "newest" | "name";
const PAGE = 30;

/** Memory module count picker, limited by the board's DIMM slots. */
function RamQuantity() {
  const { resolved } = useBuildDerived();
  const count = useBuildStore((s) => s.selection.ramCount);
  const setRamCount = useBuildStore((s) => s.setRamCount);
  const slots = resolved.motherboard?.memorySlots ?? 4;
  return (
    <div className="rounded-[var(--radius-md)] border border-violet/30 bg-violet-soft/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-medium text-fg-2">Количество модулей</span>
        <span className="text-[10.5px] text-fg-3">
          {resolved.motherboard ? `слотов на плате: ${slots}` : "плата не выбрана — до 4"}
        </span>
      </div>
      <div className="mt-2 flex gap-1.5" role="radiogroup" aria-label="Количество модулей памяти">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={count === n}
            disabled={n > slots}
            onClick={() => setRamCount(n)}
            title={n > slots ? `На плате только ${slots} слота` : undefined}
            className={cx(
              "h-8 flex-1 rounded-[var(--radius-sm)] border text-sm font-semibold transition-colors disabled:opacity-30",
              count === n ? "border-violet bg-violet-strong text-white" : "border-line bg-panel-2 text-fg-2 hover:border-line-strong hover:text-fg",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[10.5px] leading-snug text-fg-3">
        {count === 1 ? "Один модуль — одноканальный режим." : count === 3 ? "Три модуля — несимметричные каналы." : count === 2 ? "Два модуля — двухканальный режим (A2/B2)." : "Четыре модуля — все слоты заняты."} Цена в карточке — за один модуль.
      </p>
    </div>
  );
}

export function CatalogPanel() {
  const t = useMessages();
  const category = useBuildStore((s) => s.catalogCategory);
  const focusId = useBuildStore((s) => s.focusComponentId);
  const selection = useBuildStore((s) => s.selection);
  const openCatalog = useBuildStore((s) => s.openCatalog);
  const removeComponent = useBuildStore((s) => s.removeComponent);
  const setComponent = useBuildStore((s) => s.setComponent);
  // Colour picked per product group (before installing).
  const [colorPick, setColorPick] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("price-asc");
  const [onlyCompatible, setOnlyCompatible] = useState(false);
  // Facet path per category; "showAll" skips the remaining steps.
  const [paths, setPaths] = useState<Partial<Record<ComponentCategory, { path: string[]; showAll: boolean }>>>({});
  const [limit, setLimit] = useState(PAGE);

  const state = paths[category] ?? { path: [], showAll: false };
  const setState = (next: { path: string[]; showAll: boolean }) => {
    setPaths((p) => ({ ...p, [category]: next }));
    setLimit(PAGE);
  };

  // Jump straight to a component chosen in global search / database.
  const [appliedFocus, setAppliedFocus] = useState<string | null>(null);
  if (focusId && focusId !== appliedFocus) {
    const c = hardwareRepository.byId(focusId);
    setAppliedFocus(focusId);
    if (c && c.category === category) setPaths((p) => ({ ...p, [category]: { path: pathFor(c), showAll: false } }));
  }

  const all = useMemo(() => hardwareRepository.byCategory(category) as HardwareComponent[], [category]);
  const verdicts = useMemo(() => {
    const m = new Map<string, CandidateVerdict>();
    for (const c of all) m.set(c.id, evaluateCandidate(selection, c));
    return m;
  }, [all, selection]);
  const isOk = (c: HardwareComponent) => {
    const s = verdicts.get(c.id)?.status;
    return s === "compatible" || s === "unchecked" || s === "warning";
  };

  const facets = FACETS[category];
  const searching = q.trim().length > 0;
  const stepIndex = state.path.length;
  const atStep = !searching && !state.showAll && stepIndex < facets.length;

  const scoped = useMemo(() => {
    const base = searching ? all.filter((c) => `${c.brand} ${c.model} ${c.name}`.toLowerCase().includes(q.trim().toLowerCase())) : applyFacetPath(category, all, state.path);
    const filtered = onlyCompatible ? base.filter(isOk) : base;
    // Colour editions show as one card with a colour switch: installed colour, else the picked one.
    const installedIds = new Set(category === "storage" ? selection.storage : [selection[category] ?? ""]);
    return collapseColorVariants(filtered, (group) => filtered.find((c) => c.variantGroup === group && installedIds.has(c.id))?.id ?? colorPick[group]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, searching, q, category, state.path, onlyCompatible, verdicts, colorPick, selection]);

  const options = atStep ? facetOptions(facets[stepIndex], scoped, isOk) : [];

  const list = useMemo(() => {
    if (atStep) return [];
    return [...scoped].sort((a, b) => {
      if (sort === "price-asc") return a.price.amountRub - b.price.amountRub;
      if (sort === "price-desc") return b.price.amountRub - a.price.amountRub;
      if (sort === "perf") return perfKey(b) - perfKey(a);
      if (sort === "newest") return (b.releaseYear ?? 0) - (a.releaseYear ?? 0) || perfKey(b) - perfKey(a);
      return a.name.localeCompare(b.name, "ru", { numeric: true });
    });
  }, [atStep, scoped, sort]);

  useEffect(() => {
    if (!focusId || atStep) return;
    document.getElementById(`card-${focusId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusId, atStep, category]);

  const isInstalled = (id: string, cat: ComponentCategory) => (cat === "storage" ? selection.storage.includes(id) : selection[cat] === id);
  const hasCurrent = category === "storage" ? false : Boolean(selection[category]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-line p-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={t.catalog.title}>
          {CATEGORY_ORDER.map((cat) => {
            const filled = cat === "storage" ? selection.storage.length > 0 : Boolean(selection[cat]);
            return (
              <button
                key={cat}
                role="tab"
                aria-selected={cat === category}
                onClick={() => openCatalog(cat)}
                className={cx(
                  "flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-1 text-[11.5px] font-medium transition-colors",
                  cat === category ? "border-violet/50 bg-violet-soft text-fg" : "border-line text-fg-3 hover:border-line-strong hover:text-fg-2",
                )}
              >
                <ComponentThumb category={cat} size={18} className="border-0 bg-transparent" />
                {t.categoriesShort[cat]}
                {filled && <span className="size-1.5 rounded-full bg-ok" aria-label="выбрано" />}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.catalog.search} aria-label={t.catalog.search} className={cx(inputCls, "h-8 pl-8 text-xs")} />
        </div>
        {!searching && (
          <nav aria-label="Шаги выбора" className="flex flex-wrap items-center gap-1 text-[11.5px]">
            <button
              type="button"
              onClick={() => setState({ path: [], showAll: false })}
              className={cx("rounded px-1.5 py-0.5 font-medium", stepIndex === 0 && !state.showAll ? "text-fg" : "text-violet hover:underline")}
            >
              {t.categories[category]}
            </button>
            {state.path.map((v, i) => (
              <span key={i} className="flex items-center gap-1">
                <IconChevron width={11} height={11} className="text-fg-3" />
                <button
                  type="button"
                  onClick={() => setState({ path: state.path.slice(0, i + 1), showAll: false })}
                  className={cx("rounded px-1.5 py-0.5 font-medium", i === stepIndex - 1 && !state.showAll && stepIndex >= facets.length ? "text-fg" : "text-violet hover:underline")}
                >
                  {v}
                </button>
              </span>
            ))}
            {state.showAll && (
              <span className="flex items-center gap-1 text-fg-2">
                <IconChevron width={11} height={11} className="text-fg-3" /> все модели
              </span>
            )}
          </nav>
        )}
        <div className="flex items-center justify-between">
          <Switch checked={onlyCompatible} onChange={setOnlyCompatible} label={t.catalog.onlyCompatible} />
          <span className="num text-[11px] text-fg-3">{scoped.length} шт.</span>
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {category === "ram" && <RamQuantity />}
        {category === "fans" && <FanLayoutEditor />}

        {atStep ? (
          <section aria-label={facets[stepIndex].label} className="animate-in space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[12px] font-semibold text-fg-2">
                Шаг {stepIndex + 1} из {facets.length}: {facets[stepIndex].label}
              </h3>
              <Button size="sm" variant="ghost" onClick={() => setState({ path: state.path, showAll: true })}>
                Показать все
              </Button>
            </div>
            {options.length === 0 ? (
              <EmptyState title={t.catalog.empty} />
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setState({ path: [...state.path, o.value], showAll: false })}
                    className="group flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-line bg-panel-2/70 px-3 py-2.5 text-left transition-colors hover:border-violet/50 hover:bg-violet-soft/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-fg">{o.value}</span>
                      <span className="text-[10.5px] text-fg-3">
                        {o.count} шт.
                        {o.compatibleCount < o.count && <span className="text-ok"> · подходит {o.compatibleCount}</span>}
                      </span>
                    </span>
                    <IconChevron width={14} height={14} className="shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5 group-hover:text-violet" />
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] text-fg-3">{searching ? "Результаты поиска" : "Модели"}</span>
              <div className="w-40">
                <Select<Sort>
                  label={t.catalog.sort}
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: "price-asc", label: "Цена ↑" },
                    { value: "price-desc", label: "Цена ↓" },
                    { value: "perf", label: t.catalog.sortPerf },
                    { value: "newest", label: "Сначала новые" },
                    { value: "name", label: t.catalog.sortName },
                  ]}
                />
              </div>
            </div>
            {list.length === 0 && <EmptyState title={t.catalog.empty} />}
            {list.slice(0, limit).map((c) => {
              const installed = isInstalled(c.id, category);
              return (
                <ComponentCard
                  key={c.id}
                  component={c}
                  verdict={verdicts.get(c.id) ?? { status: "unchecked", checks: [] }}
                  installed={installed}
                  focused={c.id === focusId}
                  quantity={category === "ram" ? selection.ramCount : undefined}
                  actionLabel={category === "storage" ? t.catalog.add : hasCurrent ? t.catalog.replace : t.catalog.install}
                  onInstall={() => requestInstall(c)}
                  onRemove={() => removeComponent(category, c.id)}
                  variants={colorVariantsOf(c)}
                  onPickVariant={(v) => {
                    // Installed product: swap the colour in place; otherwise just show the other edition.
                    if (installed && category !== "storage") setComponent(v, { instant: true });
                    setColorPick((p) => ({ ...p, [v.variantGroup!]: v.id }));
                  }}
                />
              );
            })}
            {list.length > limit && (
              <Button variant="secondary" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>
                Показать ещё ({list.length - limit})
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
