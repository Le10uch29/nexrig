"use client";

import Link from "next/link";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { keySpecs } from "@/lib/hardware/specs";
import { formatPrice, useMessages } from "@/lib/i18n";
import { ComponentThumb } from "@/components/hardware/ComponentThumb";
import { PerformancePanel } from "@/components/benchmarks/PerformancePanel";
import { CompatibilityReportView } from "@/components/compatibility/CompatibilityReport";
import { UpgradeList } from "@/components/ai/UpgradeList";
import { HScroll } from "@/components/ui/HScroll";
import { Button, cx, EmptyState } from "@/components/ui/primitives";
import { useInspectorNav } from "./BuildSidebar";
import { CatalogPanel } from "./CatalogPanel";
import { ComparePanel } from "./ComparePanel";
import { SavedBuildsPanel } from "./SavedBuildsPanel";

function BuildDetails() {
  const t = useMessages();
  const { placements, resolved } = useBuildDerived();
  const qty = (category: string) => (category === "ram" ? resolved.ramCount : 1);
  const selectSlot = useBuildStore((s) => s.selectSlot);
  const selected = useBuildStore((s) => s.selectedSlot);
  const openCatalog = useBuildStore((s) => s.openCatalog);
  const removeComponent = useBuildStore((s) => s.removeComponent);
  if (placements.length === 0) return <EmptyState title="Сборка пуста">Выберите корпус в разделе «Конфигурация».</EmptyState>;
  return (
    <ul className="space-y-2">
      {placements.map((p) => (
        <li
          key={p.key}
          className={cx("rounded-[var(--radius-md)] border p-3", selected === p.key ? "border-violet/50 bg-violet-soft/30" : "border-line bg-panel-2/50")}
        >
          <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => selectSlot(p.key)}>
            <ComponentThumb component={p.component} size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] text-fg-3">{t.categories[p.category]}</p>
              <p className="truncate text-[13px] font-medium">
                {qty(p.category) > 1 ? `${qty(p.category)} × ` : ""}
                {p.component.name}
              </p>
              <p className={cx("text-[11px]", p.state === "mounted" ? "text-ok" : p.reason === "conflict" ? "text-bad" : "text-fg-3")}>
                {p.state === "mounted" ? t.timeline.installed : p.reasonText}
              </p>
            </div>
            <span className="num text-xs text-fg-2">{formatPrice(p.component.price.amountRub * qty(p.category))}</span>
          </button>
          {selected === p.key && (
            <div className="animate-in mt-3 border-t border-line pt-3">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                {keySpecs(p.component, true).map((s) => (
                  <div key={s.label} className="flex justify-between gap-2 text-[11px]">
                    <dt className="text-fg-3">{s.label}</dt>
                    <dd className="num truncate text-fg-2">{s.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex gap-1.5">
                <Button size="sm" onClick={() => openCatalog(p.category, p.component.id)}>
                  {t.timeline.replace}
                </Button>
                <Button size="sm" variant="danger" onClick={() => removeComponent(p.category, p.component.id)}>
                  {t.timeline.remove}
                </Button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function InspectorPanel() {
  const inspector = useBuildStore((s) => s.inspector);
  const setInspector = useBuildStore((s) => s.setInspector);
  const selection = useBuildStore((s) => s.selection);
  const perf = useBuildStore((s) => s.perf);
  const { report } = useBuildDerived();
  const nav = useInspectorNav();
  const current = nav.find((n) => n.id === inspector);

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel/60 lg:border-l lg:border-line" aria-label={current?.label}>
      {/* Tabs for narrow layouts where the sidebar nav is not beside the scene. */}
      <HScroll className="border-b border-line bg-panel lg:hidden" innerClassName="gap-1 p-2" role="tablist">
        {nav.map((n) => (
          <button
            key={n.id}
            role="tab"
            aria-selected={inspector === n.id}
            onClick={() => setInspector(n.id)}
            className={cx(
              "flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs transition-colors",
              inspector === n.id ? "bg-panel-3 text-fg" : "text-fg-3 hover:bg-panel-2 hover:text-fg",
            )}
          >
            <n.icon width={14} height={14} /> {n.label}
          </button>
        ))}
      </HScroll>
      <header className="hidden items-center gap-2 border-b border-line px-4 py-3 lg:flex">
        {current && <current.icon className="text-violet" />}
        <h2 className="text-[13px] font-semibold">{current?.label}</h2>
      </header>
      {inspector === "catalog" ? (
        <CatalogPanel />
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
          {inspector === "build" && <BuildDetails />}
          {inspector === "compat" && <CompatibilityReportView report={report} />}
          {inspector === "perf" && <PerformancePanel />}
          {inspector === "upgrade" && (
            <div className="space-y-3">
              <p className="text-[11.5px] leading-relaxed text-fg-3">
                Ранжирование по цене за +1 FPS в выбранной игре ({perf.settings.resolution}). Прирост — оценка модели, цены демонстрационные.
              </p>
              <UpgradeList selection={selection} gameId={perf.gameId} settings={perf.settings} />
              <Link href="/upgrade" className="block text-center text-xs text-violet hover:underline">
                Подробный советник по апгрейду →
              </Link>
            </div>
          )}
          {inspector === "saved" && <SavedBuildsPanel />}
          {inspector === "compare" && <ComparePanel />}
        </div>
      )}
    </section>
  );
}
