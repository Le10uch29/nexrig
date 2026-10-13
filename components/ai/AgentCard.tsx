"use client";

import { useState } from "react";
import type { AgentFinding, AgentResult } from "@/types/agents";
import { IconChevron } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";

const DOT: Record<AgentFinding["severity"], string> = {
  critical: "bg-bad",
  warning: "bg-warn",
  positive: "bg-ok",
  info: "bg-fg-3",
};

/** One specialist's output with the tools it actually executed and its data sources. */
export function AgentCard({ result, defaultOpen = false }: { result: AgentResult; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <article className="rounded-[var(--radius-md)] border border-line bg-panel">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-2 p-3 text-left">
        <IconChevron className={cx("mt-0.5 shrink-0 text-fg-3 transition-transform", open && "rotate-90")} />
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold">{result.title}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-fg-2">{result.summary}</p>
        </div>
      </button>
      {open && (
        <div className="animate-in space-y-3 border-t border-line p-3 text-[11.5px]">
          {result.findings.length > 0 && (
            <ul className="space-y-1.5">
              {result.findings.map((f, i) => (
                <li key={i} className="flex gap-2 leading-relaxed text-fg-2">
                  <span className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", DOT[f.severity])} />
                  {f.text}
                </li>
              ))}
            </ul>
          )}
          <div>
            <p className="mb-1 text-[10.5px] font-semibold tracking-wide text-fg-3 uppercase">Вызванные инструменты</p>
            <ul className="space-y-1">
              {result.toolCalls.map((c, i) => (
                <li key={i} className="rounded-[var(--radius-sm)] bg-bg-1 px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-fg-3">
                  <span className="text-cyan">{c.tool}</span>({c.input}) → <span className="text-fg-2">{c.outputSummary}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-[10.5px] font-semibold tracking-wide text-fg-3 uppercase">Источники данных</p>
            <ul className="list-disc space-y-0.5 pl-4 text-fg-3">
              {result.dataSources.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </article>
  );
}
