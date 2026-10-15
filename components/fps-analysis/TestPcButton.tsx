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
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={onClick}
          disabled={!ready}
          aria-describedby={!ready ? "test-pc-missing" : undefined}
          aria-label="Протестировать сборку"
          className={cx(
            "inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-md)] border px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors",
            ready ? "border-transparent bg-violet-strong text-white shadow-[0_8px_24px_-12px_var(--violet-strong)] hover:bg-violet" : "glass cursor-not-allowed text-fg-3",
          )}
        >
          <IconGauge className={running ? "animate-pulse" : undefined} />
          {running ? (
            "Анализ…"
          ) : (
            <>
              {/* Short label when the scene is narrow (container query on the scene). */}
              <span className="@max-3xl:hidden">Протестировать сборку</span>
              <span className="@3xl:hidden">Тест</span>
            </>
          )}
        </button>
        {!ready && (
          <p id="test-pc-missing" className="glass rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px] text-fg-3">
            Добавьте {missing.join(" и ")}
          </p>
        )}
      </div>
      <AnalysisDialog />
    </>
  );
}
