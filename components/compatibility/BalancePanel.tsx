"use client";

import { useState } from "react";
import { OVERALL_FORMULA, type BalanceItem, type BalanceReport, type BalanceStatus } from "@/features/compatibility/balance";
import { cx } from "@/components/ui/primitives";

const PRESET_LABEL: Record<string, string> = { low: "низкий", medium: "средний", high: "высокий", ultra: "ультра" };

const STATUS: Record<BalanceStatus, { label: string; text: string; bar: string; icon: string }> = {
  good: { label: "Хорошо", text: "text-ok", bar: "bg-ok", icon: "✓" },
  fair: { label: "Средне", text: "text-warn", bar: "bg-warn", icon: "!" },
  poor: { label: "Слабо", text: "text-bad", bar: "bg-bad", icon: "✕" },
  unknown: { label: "Нет данных", text: "text-fg-3", bar: "bg-fg-3", icon: "?" },
};

function Row({ item }: { item: BalanceItem }) {
  const [open, setOpen] = useState(item.status === "poor");
  const s = STATUS[item.status];
  return (
    <li className="rounded-[var(--radius-md)] border border-line bg-panel-2/50 p-2.5">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium">
            <span aria-hidden className={cx("grid size-4 shrink-0 place-items-center rounded-full border text-[9px] font-bold", s.text, "border-current")}>
              {s.icon}
            </span>
            <span className="truncate">{item.title}</span>
          </span>
          <span className={cx("num shrink-0 text-[12px] font-semibold", s.text)}>
            {item.scorePct === null ? "—" : `${item.scorePct}%`} <span className="text-[10.5px] font-normal">· {s.label}</span>
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.scorePct ?? undefined} aria-label={`${item.title}: ${item.scorePct ?? "нет данных"}%`}>
          {item.scorePct !== null && <div className={cx("h-full rounded-full", s.bar)} style={{ width: `${item.scorePct}%` }} />}
        </div>
        <p className="mt-1.5 text-[11.5px] leading-snug text-fg-2">{item.summary}</p>
      </button>
      {open && (
        <div className="animate-in mt-1.5 space-y-1 text-[11px] leading-relaxed">
          <p className="text-fg-3">{item.detail}</p>
          {item.advice && <p className="text-fg-2">→ {item.advice}</p>}
          <p className="text-[10.5px] text-fg-3">{item.basis === "model" ? "Основа: модель относительной производительности (не замер)." : "Основа: правила по характеристикам (ориентир)."}</p>
        </div>
      )}
    </li>
  );
}

/** How well the parts suit each other, per pair, in percent — with the reasoning visible. */
export function BalancePanel({ report, title = "Баланс сборки" }: { report: BalanceReport; title?: string }) {
  const overall = report.overallPct;
  const weakest = report.items.filter((i) => i.scorePct !== null).sort((a, b) => a.scorePct! - b.scorePct!)[0];
  const s = STATUS[overall === null ? "unknown" : overall >= 85 ? "good" : overall >= 65 ? "fair" : "poor"];
  return (
    <section aria-label={title} className="space-y-2.5">
      <div className="rounded-[var(--radius-md)] border border-line bg-panel-2/60 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[12.5px] font-semibold">{title}</h3>
          <span className={cx("num text-lg font-semibold", s.text)}>{overall === null ? "—" : `${overall}%`}</span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-fg-3">
          Насколько детали раскрывают друг друга ({report.settings.resolution}, пресет «{PRESET_LABEL[report.settings.preset] ?? report.settings.preset}»). Это оценка модели и правил, а не результат тестов.
          {weakest && weakest.status !== "good" && <> Слабое место: <span className="text-fg-2">{weakest.title.toLowerCase()}</span>.</>}
        </p>
        <details className="mt-1 text-[10.5px] text-fg-3">
          <summary className="cursor-pointer">Как считается общий процент</summary>
          <p className="mt-1 leading-snug">{OVERALL_FORMULA}. Это не процент совместимости: несовместимость проверяется отдельно и баланс сборку не блокирует.</p>
        </details>
      </div>
      <ul className="space-y-1.5">
        {report.items.map((i) => (
          <Row key={i.id} item={i} />
        ))}
      </ul>
    </section>
  );
}
