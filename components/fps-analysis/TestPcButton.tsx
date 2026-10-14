"use client";

import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { freezeBuild, missingForTest } from "@/features/fps-analysis/freeze";
import { useAnalysis } from "@/features/fps-analysis/store";
import { IconGauge } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";
import { AnalysisDialog } from "./AnalysisDialog";

/**
 * "Протестировать ПК" on the 3D desk. Freezes the current build and runs the server analysis
 * (/api/fps/analyze). Disabled — with the reason shown — until a CPU and a GPU are chosen.
 */
export function TestPcButton() {
  const { selection, resolved, report } = useBuildDerived();
  const buildName = useBuildStore((s) => s.buildName);
  const settings = useBuildStore((s) => s.perf.settings);
  const status = useAnalysis((s) => s.status);
  const runVersion = useAnalysis((s) => s.frozen?.version);
  const start = useAnalysis((s) => s.start);
  const setOpen = useAnalysis((s) => s.setOpen);
  const missing = missingForTest(resolved);
  const ready = missing.length === 0;
  const running = status === "running";

  const onClick = () => {
    const frozen = freezeBuild({ selection, resolved, settings, buildName, checks: report.checks });
    if (!frozen) return;
    // Reopen a run of the same build (still running or finished) instead of starting it again.
    if (frozen.version === runVersion && (running || status === "done")) return setOpen(true);
    void start(frozen);
  };

  return (
    <>
      <div className="absolute top-28 right-3 flex w-40 flex-col items-stretch gap-1 sm:top-[68px] sm:w-48">
        <button
          type="button"
          onClick={onClick}
          disabled={!ready}
          aria-describedby={!ready ? "test-pc-missing" : undefined}
          className={cx(
            "inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] border px-3 text-sm font-semibold transition-colors",
            ready ? "border-transparent bg-violet-strong text-white shadow-[0_8px_24px_-10px_var(--violet-strong)] hover:bg-violet" : "cursor-not-allowed border-line bg-panel/85 text-fg-3 backdrop-blur",
          )}
        >
          <IconGauge className={running ? "animate-pulse" : undefined} />
          {running ? "Идёт анализ…" : "Протестировать ПК"}
        </button>
        {!ready && (
          <p id="test-pc-missing" className="rounded-[var(--radius-sm)] bg-panel/85 px-2 py-1 text-center text-[11px] leading-snug text-fg-3 backdrop-blur">
            Добавьте {missing.join(" и ")}
          </p>
        )}
      </div>
      <AnalysisDialog />
    </>
  );
}
