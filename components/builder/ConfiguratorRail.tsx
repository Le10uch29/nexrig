"use client";

import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { usePrice } from "@/features/settings/currency";
import { INSTALL_ORDER, type Placement } from "@/features/installation/placement";
import { fanPacksOf } from "@/lib/hardware/repository";
import { useMessages } from "@/lib/i18n";
import type { ComponentCategory, HardwareComponent } from "@/types/hardware";
import { IconChevron, IconPlus, IconSwap, IconTrash } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";
import { CategoryIcon } from "./category-icons";

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

/** Round category glyph with the install status as a dot; violet glow when active. */
function StepIcon({ category, status, active }: { category: ComponentCategory; status: Status; active: boolean }) {
  return (
    <span
      className={cx(
        "relative grid size-10 shrink-0 place-items-center rounded-full border transition-[border-color,box-shadow,color,background-color]",
        active ? "border-violet bg-violet/15 text-fg shadow-[0_0_18px_-2px_rgb(141_125_255/0.55)]" : "border-line-strong bg-bg-0/50 text-fg-2 group-hover:border-fg-3 group-hover:text-fg",
      )}
    >
      <CategoryIcon category={category} size={17} />
      <span className={cx("absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-bg-0", STATUS_DOT[status])} aria-hidden />
    </span>
  );
}

/**
 * The configurator: every part of the build in physical installation order, with its install
 * state, price and actions. On desktop it floats over the 3D scene as a showroom-style list.
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
  const isActive = (s: Step) => (rightOpen && inspector === "catalog" && catalogCategory === s.category && (!s.component || selected === null)) || selected === s.key;

  if (collapsed) {
    return (
      <nav className="scroll-thin flex max-h-full flex-col items-center gap-2 overflow-y-auto py-1" aria-label="Комплектующие">
        <button type="button" onClick={() => setView({ leftPanel: true })} title="Показать названия деталей" aria-label="Развернуть комплектующие" className="mb-1 grid size-8 place-items-center rounded-full border border-line bg-bg-0/60 text-fg-2 backdrop-blur-md hover:border-line-strong hover:text-fg">
          <IconChevron width={14} height={14} />
        </button>
        {steps.map((s) => {
          const st = statusOf(s);
          return (
            <button key={s.key} type="button" onClick={() => open(s)} title={`${t.categories[s.category]}: ${s.component?.name ?? label[st]}`} aria-label={`${t.categories[s.category]}: ${s.component?.name ?? label[st]}`} className="group rounded-full focus-visible:outline-2 focus-visible:outline-violet">
              <StepIcon category={s.category} status={st} active={isActive(s)} />
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex max-h-full min-h-0 flex-col" aria-label="Комплектующие">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2 lg:px-1 lg:pt-0">
        <div>
          <h2 className="text-[15px] font-semibold">Комплектующие</h2>
          <p className="text-[12px] text-fg-3">В порядке установки</p>
        </div>
        <button type="button" onClick={() => setView({ leftPanel: false })} title="Только иконки" aria-label="Свернуть комплектующие" className="hidden size-8 place-items-center rounded-full border border-line bg-bg-0/60 text-fg-3 backdrop-blur-md hover:border-line-strong hover:text-fg lg:grid">
          <IconChevron width={14} height={14} className="rotate-180" />
        </button>
      </div>
      <ol className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3 lg:px-0 lg:pr-1 lg:pb-0">
        {steps.map((s) => {
          const st = statusOf(s);
          const active = isActive(s);
          const qty = s.category === "ram" ? resolved.ramCount : s.category === "fans" ? fanPacksOf(resolved) : 1;
          return (
            <li key={s.key} className={cx("group relative flex items-center gap-1 rounded-full transition-colors", active ? "bg-violet/10" : "hover:bg-[var(--hover-bg)]")}>
              <button type="button" onClick={() => open(s)} className="flex min-w-0 flex-1 items-center gap-3 rounded-full py-1 pr-2 pl-1 text-left focus-visible:outline-2 focus-visible:outline-violet" title={s.component ? t.timeline.select : t.timeline.goToStep}>
                <StepIcon category={s.category} status={st} active={active} />
                <span className="min-w-0 flex-1">
                  <span className={cx("block truncate text-[13.5px] leading-tight font-medium", active ? "text-fg" : "text-fg-2 group-hover:text-fg")}>{t.categories[s.category]}</span>
                  <span className="block truncate text-[12px] leading-snug text-fg-3">
                    {s.component ? `${qty > 1 ? `${qty} × ` : ""}${s.component.name}` : <span className={STATUS_TEXT[st]}>Выбрать</span>}
                  </span>
                  {(st === "conflict" || st === "waiting" || st === "installing") && <span className={cx("block text-[11.5px] leading-snug", STATUS_TEXT[st])}>{label[st]}</span>}
                </span>
                {s.component && <span className="num shrink-0 text-[11.5px] text-fg-3 group-hover:hidden group-focus-within:hidden max-lg:hidden">{formatPrice(s.component.price.amountRub * qty)}</span>}
              </button>
              <div className="hidden shrink-0 gap-0.5 pr-1.5 group-focus-within:flex group-hover:flex max-lg:flex">
                <button
                  type="button"
                  onClick={() => {
                    openCatalog(s.category, s.component?.id);
                    setView({ rightPanel: true });
                  }}
                  aria-label={`${s.component ? t.timeline.replace : "Выбрать"}: ${t.categories[s.category]}`}
                  title={s.component ? t.timeline.replace : "Выбрать"}
                  className="grid size-7 place-items-center rounded-full text-fg-3 hover:bg-panel-3 hover:text-fg"
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
                    className="grid size-7 place-items-center rounded-full text-fg-3 hover:bg-bad-soft hover:text-bad disabled:opacity-30"
                  >
                    <IconTrash width={14} height={14} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
