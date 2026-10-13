"use client";

import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { INSTALL_ORDER, type Placement } from "@/features/installation/placement";
import { useMessages } from "@/lib/i18n";
import type { ComponentCategory, HardwareComponent } from "@/types/hardware";
import { ComponentThumb } from "@/components/hardware/ComponentThumb";
import { IconSwap, IconTrash } from "@/components/ui/icons";
import { HScroll } from "@/components/ui/HScroll";
import { cx } from "@/components/ui/primitives";

type Status = "installed" | "installing" | "conflict" | "waiting" | "empty";

const STATUS_CLS: Record<Status, string> = {
  installed: "text-ok",
  installing: "text-violet",
  conflict: "text-bad",
  waiting: "text-fg-3",
  empty: "text-fg-3",
};

interface Step {
  key: string;
  category: ComponentCategory;
  component?: HardwareComponent;
  placement?: Placement;
}

/** Selected components in physical installation order with per-step actions. */
export function BuildTimeline() {
  const t = useMessages();
  const { placements } = useBuildDerived();
  const motion = useBuildStore((s) => s.motion);
  const selected = useBuildStore((s) => s.selectedSlot);
  const selectSlot = useBuildStore((s) => s.selectSlot);
  const openCatalog = useBuildStore((s) => s.openCatalog);
  const removeComponent = useBuildStore((s) => s.removeComponent);

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
  const label: Record<Status, string> = {
    installed: t.timeline.installed,
    installing: t.timeline.installing,
    conflict: t.timeline.conflict,
    waiting: t.timeline.waiting,
    empty: t.timeline.empty,
  };

  return (
    <section aria-label={t.timeline.title} className="border-t border-line bg-panel">
      <HScroll innerClassName="gap-2 p-2.5">
        {steps.map((s, i) => {
          const st = statusOf(s);
          const isSel = selected === s.key;
          return (
            <div
              key={s.key}
              className={cx(
                "group relative flex w-[188px] shrink-0 items-center gap-2.5 rounded-[var(--radius-md)] border p-2 transition-colors",
                isSel ? "border-violet/55 bg-violet-soft/50" : "border-line bg-panel-2/60 hover:border-line-strong",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                onClick={() => (s.component ? selectSlot(s.key) : openCatalog(s.category))}
                title={s.component ? t.timeline.select : t.timeline.goToStep}
              >
                <div className="relative">
                  <ComponentThumb component={s.component} category={s.category} size={36} />
                  <span className="num absolute -top-1.5 -left-1.5 grid size-4 place-items-center rounded-full border border-line bg-bg-1 text-[9px] text-fg-3">{i + 1}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-fg-3">{t.categoriesShort[s.category]}</p>
                  <p className="truncate text-[11.5px] font-medium" title={s.component?.name}>
                    {s.component?.name ?? "—"}
                  </p>
                  <p className={cx("flex items-center gap-1 text-[10.5px]", STATUS_CLS[st])}>
                    {st === "installing" && <span className="size-1.5 animate-pulse rounded-full bg-violet" />}
                    {label[st]}
                  </p>
                </div>
              </button>
              <div className="flex flex-col gap-1 opacity-70 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => openCatalog(s.category, s.component?.id)}
                  aria-label={`${t.timeline.replace}: ${t.categories[s.category]}`}
                  title={s.component ? t.timeline.replace : t.timeline.goToStep}
                  className="grid size-6 place-items-center rounded text-fg-3 hover:bg-panel-3 hover:text-fg"
                >
                  <IconSwap width={13} height={13} />
                </button>
                {s.component && (
                  <button
                    type="button"
                    disabled={Boolean(motion[s.key])}
                    onClick={() => removeComponent(s.category, s.component!.id)}
                    aria-label={`${t.timeline.remove}: ${s.component.name}`}
                    title={t.timeline.remove}
                    className="grid size-6 place-items-center rounded text-fg-3 hover:bg-bad-soft hover:text-bad disabled:opacity-30"
                  >
                    <IconTrash width={13} height={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </HScroll>
    </section>
  );
}
