"use client";

import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore, type InspectorView } from "@/features/build-state/store";
import { IconArrowUp, IconBookmark, IconCompare, IconCube, IconGauge, IconList, IconShield } from "@/components/ui/icons";

/** Inspector sections; `short` labels are used in the tab bar. */
export function useInspectorNav() {
  const { report } = useBuildDerived();
  const issues = report.counts.incompatible + report.counts.warning;
  return [
    { id: "catalog" as InspectorView, label: "Выбор комплектующих", short: "Каталог", icon: IconCube },
    { id: "build" as InspectorView, label: "Текущая сборка", short: "Сборка", icon: IconList },
    { id: "compat" as InspectorView, label: "Совместимость", short: "Совместимость", icon: IconShield, badge: issues || undefined },
    { id: "perf" as InspectorView, label: "FPS и производительность", short: "FPS", icon: IconGauge },
    { id: "upgrade" as InspectorView, label: "Рекомендации по апгрейду", short: "Апгрейд", icon: IconArrowUp },
    { id: "saved" as InspectorView, label: "Сохранённые сборки", short: "Сохранённые", icon: IconBookmark },
    { id: "compare" as InspectorView, label: "Сравнение сборок", short: "Сравнение", icon: IconCompare },
  ];
}

/** Opens a section in the inspector and makes sure the inspector is visible. */
export function useOpenSection() {
  const setInspector = useBuildStore((s) => s.setInspector);
  const setView = useBuildStore((s) => s.setView);
  return (id: InspectorView) => {
    setInspector(id);
    setView({ rightPanel: true });
  };
}
