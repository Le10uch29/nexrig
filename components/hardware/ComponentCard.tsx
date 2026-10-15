"use client";

import { useState } from "react";
import { usePrice } from "@/features/settings/currency";
import type { CandidateVerdict } from "@/features/compatibility/engine";
import { keySpecs } from "@/lib/hardware/specs";
import { useMessages } from "@/lib/i18n";
import type { HardwareComponent } from "@/types/hardware";
import { IconCheck, IconChevron } from "@/components/ui/icons";
import { Button, cx, StatusIcon, StatusPill } from "@/components/ui/primitives";
import { ColorSwatches } from "./ColorSwatches";
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
  variants,
  onPickVariant,
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
  /** Colour editions of this product (white/black); shows a colour switch. */
  variants?: HardwareComponent[];
  onPickVariant?: (c: HardwareComponent) => void;
}) {
  const formatPrice = usePrice();
  const t = useMessages();
  const [open, setOpen] = useState(false);
  const specs = keySpecs(component, open);
  const issues = verdict.checks.filter((c) => c.status !== "compatible");
  // The most important problem is visible without expanding the card.
  const topIssue = issues.find((c) => c.status === "incompatible") ?? issues.find((c) => c.status === "warning");
  return (
    <article
      id={`card-${component.id}`}
      className={cx(
        "rounded-[var(--radius-md)] border p-3 transition-[border-color,background-color,box-shadow] duration-150",
        installed
          ? "border-[var(--selected-border)] bg-[var(--selected-bg)]"
          : focused
            ? "border-violet/60 bg-panel-2/60 shadow-[0_0_0_3px_var(--violet-soft)]"
            : "border-line bg-panel-2/60 hover:border-line-strong hover:bg-panel-2",
      )}
    >
      <div className="flex gap-3">
        <ComponentThumb component={component} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="flex min-w-0 items-center gap-1.5 text-[13px] leading-tight font-semibold" title={component.name}>
                <span className="truncate">{component.name}</span>
                {installed && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-violet-soft px-1.5 py-px text-[10px] font-semibold text-violet">
                    <IconCheck width={10} height={10} /> {t.catalog.installed}
                  </span>
                )}
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
          {topIssue && !open && (
            <p className={cx("mt-2 line-clamp-2 text-[11px] leading-snug", topIssue.status === "incompatible" ? "text-bad" : "text-warn")}>
              {topIssue.title}: {topIssue.detail}
            </p>
          )}
          {variants && onPickVariant && variants.length > 1 && (
            <div className="mt-2">
              <ColorSwatches variants={variants} current={component.id} onPick={onPickVariant} />
            </div>
          )}
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
