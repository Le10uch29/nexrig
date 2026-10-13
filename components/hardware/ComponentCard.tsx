"use client";

import { useState } from "react";
import type { CandidateVerdict } from "@/features/compatibility/engine";
import { keySpecs } from "@/lib/hardware/specs";
import { formatPrice, useMessages } from "@/lib/i18n";
import type { HardwareComponent } from "@/types/hardware";
import { IconChevron } from "@/components/ui/icons";
import { Button, cx, StatusIcon, StatusPill } from "@/components/ui/primitives";
import { ComponentThumb } from "./ComponentThumb";

export function ComponentCard({
  component,
  verdict,
  installed,
  focused,
  onInstall,
  onRemove,
  actionLabel,
  quantity,
}: {
  component: HardwareComponent;
  verdict: CandidateVerdict;
  installed: boolean;
  focused?: boolean;
  onInstall: () => void;
  onRemove?: () => void;
  actionLabel: string;
  /** Memory: number of modules that will be installed (price shown per module + total). */
  quantity?: number;
}) {
  const t = useMessages();
  const [open, setOpen] = useState(false);
  const specs = keySpecs(component, open);
  const issues = verdict.checks.filter((c) => c.status !== "compatible");
  return (
    <article
      id={`card-${component.id}`}
      className={cx(
        "rounded-[var(--radius-md)] border bg-panel-2/60 p-3 transition-colors",
        installed ? "border-ok/35" : focused ? "border-violet/60 shadow-[0_0_0_3px_var(--violet-soft)]" : "border-line hover:border-line-strong",
      )}
    >
      <div className="flex gap-3">
        <ComponentThumb component={component} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[13px] leading-tight font-semibold" title={component.name}>
                {component.name}
              </h3>
              <p className="mt-0.5 truncate text-[11px] text-fg-3" title={`${component.brand} · ${component.model}`}>
                {component.brand} · {component.model}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="num text-[13px] font-medium">{formatPrice(component.price.amountRub * (quantity ?? 1))}</p>
              {quantity !== undefined && (
                <p className="num text-[10.5px] text-fg-3">
                  {quantity} × {formatPrice(component.price.amountRub)}
                </p>
              )}
            </div>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {specs.map((s) => (
              <div key={s.label} className="flex min-w-0 items-baseline justify-between gap-2 text-[11px]">
                <dt className="truncate text-fg-3">{s.label}</dt>
                <dd className="num truncate text-fg-2">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1.5 rounded text-left"
          title="Подробнее о совместимости и данных"
        >
          <StatusPill status={installed && verdict.status === "unchecked" ? "compatible" : verdict.status} size="xs" />
          <IconChevron width={12} height={12} className={cx("shrink-0 text-fg-3 transition-transform", open && "rotate-90")} />
        </button>
        <div className="flex gap-1.5">
          {installed && onRemove && (
            <Button size="sm" variant="ghost" onClick={onRemove}>
              {t.catalog.remove}
            </Button>
          )}
          <Button size="sm" variant={installed ? "secondary" : "primary"} disabled={installed} onClick={onInstall}>
            {installed ? t.catalog.installed : actionLabel}
          </Button>
        </div>
      </div>
      {open && (
        <div className="animate-in mt-3 space-y-2 border-t border-line pt-3">
          {issues.length === 0 && verdict.checks.length > 0 && <p className="text-[11px] text-ok">Все применимые проверки пройдены.</p>}
          {verdict.checks.length === 0 && <p className="text-[11px] text-fg-3">Нет компонентов, с которыми эту деталь можно сопоставить.</p>}
          {issues.map((c) => (
            <div key={c.id} className="text-[11px] leading-relaxed">
              <p className={cx("flex items-center gap-1.5 font-medium", c.status === "incompatible" ? "text-bad" : "text-warn")}>
                <StatusIcon status={c.status} className="size-3" /> {c.title}
              </p>
              <p className="text-fg-2">{c.detail}</p>
              {c.resolution && <p className="text-fg-3">→ {c.resolution}</p>}
            </div>
          ))}
          {component.variantNote && <p className="text-[10.5px] leading-snug text-warn/90">{component.variantNote}</p>}
          <p className="text-[10.5px] text-fg-3">
            {t.catalog.dataQuality[component.dataQuality]}. Цена — демо от {component.price.asOf}.
          </p>
        </div>
      )}
    </article>
  );
}
