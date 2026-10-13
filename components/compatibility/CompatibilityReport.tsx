"use client";

import { STATUS_SEVERITY } from "@/features/compatibility/engine";
import { useMessages } from "@/lib/i18n";
import type { CheckStatus, CompatibilityReport as Report } from "@/types/compatibility";
import { IconBolt } from "@/components/ui/icons";
import { cx, EmptyState, StatusIcon, StatusPill } from "@/components/ui/primitives";

const ICON_COLOR: Record<CheckStatus, string> = {
  compatible: "text-ok",
  incompatible: "text-bad",
  verify: "text-warn",
  insufficient: "text-fg-3",
};

export function CompatibilityReportView({ report, compact = false }: { report: Report; compact?: boolean }) {
  const t = useMessages();
  const checks = [...report.checks].sort((a, b) => STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status]);
  if (checks.length === 0) return <EmptyState title={t.compat.noChecks} />;
  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-md)] border border-line bg-panel-2/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-fg-3">{t.compat.overall}</span>
          <StatusPill status={report.overall} />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
          {(["compatible", "verify", "insufficient", "incompatible"] as CheckStatus[]).map((s) => (
            <div key={s} className="rounded-[var(--radius-sm)] bg-bg-1 px-1 py-1.5">
              <p className={cx("num text-sm font-semibold", ICON_COLOR[s])}>{report.counts[s]}</p>
              <p className="truncate text-[10px] text-fg-3" title={t.status[s]}>
                {t.status[s]}
              </p>
            </div>
          ))}
        </div>
        {report.estimatedPeakPowerW !== null && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-fg-2">
            <IconBolt width={13} height={13} className="text-cyan" /> {t.sidebar.peakPower}: <span className="num">~{report.estimatedPeakPowerW} Вт</span>
          </p>
        )}
      </div>
      <ul className="space-y-1.5">
        {checks.map((c) => (
          <li key={c.id} className={cx("rounded-[var(--radius-md)] border p-2.5", c.status === "compatible" ? "border-line/60" : "border-line bg-panel-2/50")}>
            <div className="flex items-start gap-2">
              <StatusIcon status={c.status} className={cx("mt-0.5 size-3.5 shrink-0", ICON_COLOR[c.status])} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12.5px] font-medium">{c.title}</p>
                  {!compact && <StatusPill status={c.status} size="xs" />}
                </div>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-fg-2">{c.detail}</p>
                {c.resolution && (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-fg-3">
                    <span className="font-medium text-fg-2">{t.compat.resolution}:</span> {c.resolution}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[10.5px] leading-relaxed text-fg-3">{t.compat.subtitle}</p>
    </div>
  );
}
