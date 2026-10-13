"use client";

import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore, type InspectorView } from "@/features/build-state/store";
import { formatPrice, useMessages } from "@/lib/i18n";
import { CATEGORY_ORDER } from "@/types/hardware";
import { ComponentThumb } from "@/components/hardware/ComponentThumb";
import { IconArrowUp, IconBookmark, IconCompare, IconCube, IconGauge, IconList, IconReset, IconShield } from "@/components/ui/icons";
import { Button, cx, StatusPill } from "@/components/ui/primitives";

export function useInspectorNav() {
  const t = useMessages();
  const { report } = useBuildDerived();
  const issues = report.counts.incompatible + report.counts.verify;
  return [
    { id: "build" as InspectorView, label: t.sidebar.currentBuild, icon: IconList },
    { id: "catalog" as InspectorView, label: t.sidebar.workspace, icon: IconCube },
    { id: "compat" as InspectorView, label: t.sidebar.compatibility, icon: IconShield, badge: issues || undefined },
    { id: "perf" as InspectorView, label: t.sidebar.fps, icon: IconGauge },
    { id: "upgrade" as InspectorView, label: t.sidebar.upgrade, icon: IconArrowUp },
    { id: "saved" as InspectorView, label: t.sidebar.saved, icon: IconBookmark },
    { id: "compare" as InspectorView, label: t.sidebar.compare, icon: IconCompare },
  ];
}

export function BuildSidebar() {
  const t = useMessages();
  const { resolved, report, total } = useBuildDerived();
  const buildName = useBuildStore((s) => s.buildName);
  const setBuildName = useBuildStore((s) => s.setBuildName);
  const inspector = useBuildStore((s) => s.inspector);
  const setInspector = useBuildStore((s) => s.setInspector);
  const openCatalog = useBuildStore((s) => s.openCatalog);
  const resetBuild = useBuildStore((s) => s.resetBuild);
  const clearBuild = useBuildStore((s) => s.clearBuild);
  const nav = useInspectorNav();

  return (
    <aside className="scroll-thin flex h-full min-h-0 flex-col overflow-y-auto border-line bg-panel/60 lg:border-r" aria-label={t.sidebar.currentBuild}>
      <div className="border-b border-line p-3">
        <label htmlFor="build-name" className="sr-only">
          {t.sidebar.buildName}
        </label>
        <input
          id="build-name"
          value={buildName}
          onChange={(e) => setBuildName(e.target.value)}
          maxLength={120}
          className="w-full truncate rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1 py-0.5 text-[14px] font-semibold outline-none hover:border-line focus:border-violet/60"
        />
        <div className="mt-2 flex items-end justify-between px-1">
          <div>
            <p className="text-[10.5px] font-medium tracking-wide text-fg-3 uppercase">{t.sidebar.total}</p>
            <p className="num text-xl font-semibold tracking-tight">{formatPrice(total)}</p>
          </div>
          <StatusPill status={report.overall} size="xs" />
        </div>
        <p className="mt-1 px-1 text-[10.5px] text-fg-3">
          {report.estimatedPeakPowerW ? <>~{report.estimatedPeakPowerW} Вт пик · </> : null}
          {t.sidebar.demoPrices}
        </p>
      </div>

      <nav className="border-b border-line p-2" aria-label="Разделы сборки">
        {nav.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => setInspector(n.id)}
            aria-current={inspector === n.id ? "true" : undefined}
            className={cx(
              "flex h-8 w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 text-[12.5px] transition-colors",
              inspector === n.id ? "bg-panel-3 text-fg" : "text-fg-2 hover:bg-panel-2 hover:text-fg",
            )}
          >
            <n.icon className={inspector === n.id ? "text-violet" : "text-fg-3"} />
            <span className="flex-1 truncate text-left">{n.label}</span>
            {n.badge ? <span className="num rounded-full bg-warn-soft px-1.5 text-[10px] text-warn">{n.badge}</span> : null}
          </button>
        ))}
      </nav>

      <ul className="flex-1 space-y-0.5 p-2" aria-label="Выбранные компоненты">
        {CATEGORY_ORDER.map((cat) => {
          const items = cat === "storage" ? resolved.storage : resolved[cat] ? [resolved[cat]!] : [];
          return (
            <li key={cat}>
              <button
                type="button"
                onClick={() => openCatalog(cat)}
                className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-1.5 py-1.5 text-left hover:bg-panel-2"
              >
                <ComponentThumb component={items[0]} category={cat} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10.5px] text-fg-3">{t.categories[cat]}</span>
                  <span className={cx("block truncate text-[12px]", items.length ? "text-fg" : "text-fg-3 italic")}>
                    {items.length ? items.map((c) => (c.category === "ram" ? `${resolved.ramCount} × ${c.name}` : c.name)).join(", ") : t.sidebar.notSelected}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-1.5 border-t border-line p-2">
        <Button size="sm" variant="ghost" className="flex-1" onClick={resetBuild} title="Вернуть стартовую конфигурацию">
          <IconReset width={13} height={13} /> {t.actions.reset}
        </Button>
        <Button size="sm" variant="ghost" className="flex-1" onClick={clearBuild}>
          {t.actions.newBuild}
        </Button>
      </div>
    </aside>
  );
}
