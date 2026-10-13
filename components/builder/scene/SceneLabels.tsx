"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { useMessages } from "@/lib/i18n";
import { labelElements } from "./label-registry";

/** A DOM label that follows the 3D anchor with the same id (positioned by LabelProjector). */
function SceneLabel({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    labelElements.set(id, el);
    return () => {
      if (labelElements.get(id) === el) labelElements.delete(id);
    };
  }, [id]);
  return (
    <div ref={ref} className="absolute top-0 left-0 will-change-transform" style={{ visibility: "hidden" }}>
      {children}
    </div>
  );
}

/** Labels for every placed part plus the bench, rendered over the canvas. */
export function SceneLabels() {
  const t = useMessages();
  const { placements } = useBuildDerived();
  const selected = useBuildStore((s) => s.selectedSlot);
  const hovered = useBuildStore((s) => s.hoveredSlot);
  const labels = useBuildStore((s) => s.view.labels);
  const motion = useBuildStore((s) => s.motion);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <SceneLabel id="bench">
        <span className="text-[10px] font-semibold tracking-[0.12em] whitespace-nowrap text-[#9fd0dc] uppercase">Коврик сборки</span>
      </SceneLabel>
      {placements
        .filter((p) => p.category !== "case")
        .map((p) => {
          const isSel = selected === p.key;
          const isHov = hovered === p.key;
          if (!(isSel || isHov || (labels && !motion[p.key]))) return null;
          const conflict = p.state === "parked" && p.reason === "conflict";
          const waiting = p.state === "parked" && p.reason === "waiting";
          return (
            <SceneLabel key={p.key} id={p.key}>
              <div
                className={
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium whitespace-nowrap shadow-lg backdrop-blur-sm " +
                  (conflict
                    ? "border-bad/40 bg-[#2a0f16]/90 text-bad"
                    : waiting
                      ? "border-line-strong bg-panel/90 text-fg-2"
                      : isSel
                        ? "border-violet/50 bg-[#17142e]/90 text-fg"
                        : "border-line bg-panel/85 text-fg-2")
                }
              >
                <span className={"size-1.5 rounded-full " + (conflict ? "bg-bad" : waiting ? "bg-fg-3" : "bg-ok")} />
                {isSel || isHov ? p.component.name : t.categoriesShort[p.category]}
                {(conflict || waiting) && (isSel || isHov) && <span className="text-fg-3">· {p.reasonText}</span>}
              </div>
            </SceneLabel>
          );
        })}
    </div>
  );
}
