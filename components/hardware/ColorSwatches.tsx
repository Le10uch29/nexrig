"use client";

import { COLORWAY_LABEL } from "@/components/PcComponents/shared";
import type { HardwareComponent } from "@/types/hardware";
import { cx } from "@/components/ui/primitives";

/** Colour switch for products sold in several finishes (each finish is its own SKU). */
export function ColorSwatches({ variants, current, onPick, size = "sm" }: { variants: HardwareComponent[]; current: string; onPick: (c: HardwareComponent) => void; size?: "sm" | "md" }) {
  if (variants.length < 2) return null;
  return (
    <div role="radiogroup" aria-label="Цвет" className="flex items-center gap-1.5">
      <span className="text-[10.5px] text-fg-3">Цвет:</span>
      {variants.map((v) => {
        const active = v.id === current;
        const label = COLORWAY_LABEL[v.colorway ?? "black"];
        return (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={`${label} — ${v.name}`}
            onClick={() => !active && onPick(v)}
            className={cx(
              "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] transition-colors",
              active ? "border-violet/60 bg-violet-soft text-fg" : "border-line text-fg-3 hover:border-line-strong hover:text-fg-2",
            )}
          >
            <span className={cx("rounded-full border border-white/25", size === "md" ? "size-3.5" : "size-3")} style={{ background: v.visual.color }} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
