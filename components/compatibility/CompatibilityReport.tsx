"use client";

import { useState } from "react";
import { useMessages } from "@/lib/i18n";
import type { CheckSeverity, CheckStatus, CompatibilityCheck, CompatibilityReport as Report } from "@/types/compatibility";
import { IconBolt, IconChevron } from "@/components/ui/icons";
import { cx, EmptyState, StatusIcon, StatusPill } from "@/components/ui/primitives";

const ICON_COLOR: Record<CheckStatus, string> = {
  compatible: "text-ok",
  incompatible: "text-bad",
  warning: "text-warn",
  unknown: "text-fg-3",
};

const SEVERITY_LABEL: Record<CheckSeverity, string> = {
  critical: "Критично",
  major: "Существенно",
  minor: "Незначительно",
  info: "Информация",
};

const GROUPS: { status: CheckStatus; title: string; defaultOpen: boolean }[] = [
  { status: "incompatible", title: "Критические ошибки", defaultOpen: true },
  { status: "warning", title: "Предупреждения", defaultOpen: true },
  { status: "unknown", title: "Недостаточно данных", defaultOpen: true },
  { status: "compatible", title: "Успешно проверено", defaultOpen: false },
];

function CheckCard({ c }: { c: CompatibilityCheck }) {
  const t = useMessages();
  const ok = c.status === "compatible";
  return (
    <li className={cx("rounded-[var(--radius-md)] border p-3", ok ? "border-line/60 bg-transparent" : "border-line bg-panel-2/60")}>
      <div className="flex items-start gap-2.5">
        <StatusIcon status={c.status} className={cx("mt-0.5 size-4 shrink-0", ICON_COLOR[c.status])} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <p className="text-[13px] leading-snug font-semibold">{c.title}</p>
            {!ok && <span className="text-[10.5px] font-medium tracking-wide text-fg-3 uppercase">{SEVERITY_LABEL[c.severity]}</span>}
          </div>
          {c.components.length > 0 && <p className="text-[11px] leading-snug text-fg-3">{c.components.join(" · ")}</p>}
          <p className="text-[12px] leading-relaxed text-fg-2">{c.detail}</p>
          {!ok && <p className="text-[11.5px] leading-relaxed text-fg-3">{c.why}</p>}
          {c.resolution && (
            <p className="rounded-[var(--radius-sm)] bg-bg-1 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-fg-2">
              <span className="font-semibold text-fg">{t.compat.resolution}: </span>
              {c.resolution}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function Group({ status, title, checks, defaultOpen }: { status: CheckStatus; title: string; checks: CompatibilityCheck[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (checks.length === 0) return null;
  return (
    <section>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 py-1.5 text-left">
        <IconChevron width={13} height={13} className={cx("text-fg-3 transition-transform", open && "rotate-90")} />
        <StatusIcon status={status} className={cx("size-3.5", ICON_COLOR[status])} />
        <span className="text-[12px] font-semibold">{title}</span>
        <span className="num ml-auto rounded-full bg-panel-3 px-2 text-[11px] text-fg-2">{checks.length}</span>
      </button>
      {open && <ul className="mt-1.5 space-y-1.5">{checks.map((c) => <CheckCard key={c.id} c={c} />)}</ul>}
    </section>
  );
}

export function CompatibilityReportView({ report }: { report: Report }) {
  const t = useMessages();
  if (report.checks.length === 0) return <EmptyState title={t.compat.noChecks} />;
  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-md)] border border-line bg-panel-2/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-fg-3">{t.compat.overall}</span>
          <StatusPill status={report.overall} />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
          {(["incompatible", "warning", "unknown", "compatible"] as CheckStatus[]).map((s) => (
            <div key={s} className="rounded-[var(--radius-sm)] bg-bg-1 px-1 py-1.5">
              <p className={cx("num text-base font-semibold", ICON_COLOR[s])}>{report.counts[s]}</p>
              <p className="text-[10px] leading-tight text-fg-3">{t.status[s]}</p>
            </div>
          ))}
        </div>
        {report.estimatedPeakPowerW !== null && (
          <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
            <p className="flex items-center gap-1.5 text-fg-2">
              <IconBolt width={13} height={13} className="text-cyan" /> Расчётное потребление: <span className="num text-fg">~{report.estimatedPeakPowerW} Вт</span>
            </p>
            {report.recommendedPsuW !== null && (
              <p className="text-fg-2">
                Рекомендуемый БП: <span className="num text-fg">от {report.recommendedPsuW} Вт</span>
              </p>
            )}
          </div>
        )}
      </div>
      {GROUPS.map((g) => (
        <Group key={g.status} status={g.status} title={g.title} defaultOpen={g.defaultOpen} checks={report.checks.filter((c) => c.status === g.status)} />
      ))}
      <p className="text-[10.5px] leading-relaxed text-fg-3">{t.compat.subtitle} «Недостаточно данных» никогда не считается подтверждённой совместимостью.</p>
    </div>
  );
}
