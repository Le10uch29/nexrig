"use client";

import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { usePrice } from "@/features/settings/currency";
import { INSTALL_ORDER, type Placement } from "@/features/installation/placement";
import { useMessages } from "@/lib/i18n";
import type { ComponentCategory, HardwareComponent } from "@/types/hardware";
import { ComponentThumb } from "@/components/hardware/ComponentThumb";
import { IconChevron, IconPlus, IconSwap, IconTrash } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";

type Status = "installed" | "installing" | "conflict" | "waiting" | "empty";

const STATUS_DOT: Record<Status, string> = { installed: "bg-ok", installing: "bg-violet animate-pulse", conflict: "bg-bad", waiting: "bg-warn", empty: "bg-fg-3/50" };
const STATUS_TEXT: Record<Status, string> = { installed: "text-ok", installing: "text-violet", conflict: "text-bad", waiting: "text-warn", empty: "text-fg-3" };

interface Step {
  key: string;
  category: ComponentCategory;
  component?: HardwareComponent;
  placement?: Placement;
}

function useSteps() {
  const { placements } = useBuildDerived();
  const motion = useBuildStore((s) => s.motion);
  const steps: Step[] = INSTALL_ORDER.flatMap((cat): Step[] => {
    const ps = placements.filter((p) => p.category === cat);
    if (ps.length === 0) return [{ key: cat, category: cat }];
    return ps.map((p) => ({ key: p.key, category: cat, component: p.component, placement: p }));
  });
  const statusOf = (s: Step): Status => {
    if (!s.placement) return "empty";
    if (motion[s.key]) return "installing";
    if (s.placement.state === "mounted") return "installed";
    return s.placement.reason === "conflict" ? "conflict" : "waiting";
  };
  return { steps, statusOf, motion };
}

/**
 * The configurator: every part of the build in physical installation order, with its install
 * state, price and actions. Replaces the former side list and bottom timeline (one place, not two).
 */
export function ConfiguratorRail({ collapsed = false }: { collapsed?: boolean }) {
  const t = useMessages();
  const formatPrice = usePrice();
  const { resolved } = useBuildDerived();
  const { steps, statusOf, motion } = useSteps();
  const inspector = useBuildStore((s) => s.inspector);
  const catalogCategory = useBuildStore((s) => s.catalogCategory);
  const selected = useBuildStore((s) => s.selectedSlot);
  const selectSlot = useBuildStore((s) => s.selectSlot);
  const openCatalog = useBuildStore((s) => s.openCatalog);
  const removeComponent = useBuildStore((s) => s.removeComponent);
  const setView = useBuildStore((s) => s.setView);
  const rightOpen = useBuildStore((s) => s.view.rightPanel ?? true);

  const open = (s: Step) => {
    if (s.component) selectSlot(s.key);
    openCatalog(s.category, s.component?.id ?? null);
    setView({ rightPanel: true });
  };
  const label: Record<Status, string> = {
    installed: t.timeline.installed,
    installing: t.timeline.installing,
    conflict: t.timeline.conflict,
    waiting: t.timeline.waiting,
    empty: t.timeline.empty,
  };

  if (collapsed) {
    return (
      <aside className="scroll-thin flex h-full min-h-0 flex-col items-center gap-1.5 overflow-y-auto border-r border-line bg-bg-1 py-3" aria-label="Комплектующие">
        <button type="button" onClick={() => setView({ leftPanel: true })} title="Развернуть комплектующие" aria-label="Развернуть комплектующие" className="mb-1 grid size-9 place-items-center rounded-[var(--radius-sm)] text-fg-2 hover:bg-[var(--hover-bg)] hover:text-fg">
          <IconChevron />
        </button>
        {steps.map((s) => {
          const st = statusOf(s);
          return (
            <button key={s.key} type="button" onClick={() => open(s)} title={`${t.categories[s.category]}: ${s.component?.name ?? label[st]}`} aria-label={`${t.categories[s.category]}: ${s.component?.name ?? label[st]}`} className="relative rounded-[var(--radius-md)] hover:ring-1 hover:ring-violet/40">
              <ComponentThumb component={s.component} category={s.category} size={38} />
              <span className={cx("absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-bg-1", STATUS_DOT[st])} aria-hidden />
            </button>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-line bg-bg-1 lg:border-r" aria-label="Комплектующие">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <div>
          <h2 className="text-[15px] font-semibold">Комплектующие</h2>
          <p className="text-[12px] text-fg-3">В порядке установки</p>
        </div>
        <button type="button" onClick={() => setView({ leftPanel: false })} title="Свернуть" aria-label="Свернуть комплектующие" className="hidden size-8 place-items-center rounded-[var(--radius-sm)] text-fg-3 hover:bg-[var(--hover-bg)] hover:text-fg lg:grid">
          <IconChevron className="rotate-180" />
        </button>
      </div>
      <ol className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {steps.map((s, i) => {
          const st = statusOf(s);
          const active = (rightOpen && inspector === "catalog" && catalogCategory === s.category && !s.component) || selected === s.key;
          const qty = s.category === "ram" ? resolved.ramCount : 1;
          return (
            <li key={s.key} className={cx("group relative flex items-center gap-3 rounded-[var(--radius-lg)] p-2 transition-colors", active ? "bg-[var(--selected-bg)] ring-1 ring-[var(--selected-border)]" : "hover:bg-[var(--hover-bg)]")}>
              <button type="button" onClick={() => open(s)} className="flex min-w-0 flex-1 items-center gap-3 text-left" title={s.component ? t.timeline.select : t.timeline.goToStep}>
                <span className="relative">
                  <ComponentThumb component={s.component} category={s.category} size={48} />
                  <span className="num absolute -top-1 -left-1 grid size-[18px] place-items-center rounded-full bg-bg-0 text-[10px] text-fg-3 ring-1 ring-line">{i + 1}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] text-fg-3">{t.categories[s.category]}</span>
                  <span className={cx("block truncate text-[14px] leading-snug font-medium", !s.component && "text-fg-3")}>
                    {s.component ? `${qty > 1 ? `${qty} × ` : ""}${s.component.name}` : "Выбрать"}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[12px]">
                    {s.component && <span className="num text-fg-2">{formatPrice(s.component.price.amountRub * qty)}</span>}
                    <span className={cx("flex items-center gap-1", STATUS_TEXT[st])}>
                      <span className={cx("size-1.5 rounded-full", STATUS_DOT[st])} aria-hidden />
                      {label[st]}
                    </span>
                  </span>
                </span>
              </button>
              <div className="flex flex-col gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100">
                <button
                  type="button"
                  onClick={() => {
                    openCatalog(s.category, s.component?.id);
                    setView({ rightPanel: true });
                  }}
                  aria-label={`${s.component ? t.timeline.replace : "Выбрать"}: ${t.categories[s.category]}`}
                  title={s.component ? t.timeline.replace : "Выбрать"}
                  className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-fg-3 hover:bg-panel-3 hover:text-fg"
                >
                  {s.component ? <IconSwap width={14} height={14} /> : <IconPlus width={14} height={14} />}
                </button>
                {s.component && (
                  <button
                    type="button"
                    disabled={Boolean(motion[s.key])}
                    onClick={() => removeComponent(s.category, s.component!.id)}
                    aria-label={`${t.timeline.remove}: ${s.component.name}`}
                    title={t.timeline.remove}
                    className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-fg-3 hover:bg-bad-soft hover:text-bad disabled:opacity-30"
                  >
                    <IconTrash width={14} height={14} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
