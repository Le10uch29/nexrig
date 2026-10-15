import type { ReactNode } from "react";
import type { HardwareComponent } from "@/types/hardware";
import { ComponentThumb } from "@/components/hardware/ComponentThumb";
import { cx } from "./primitives";

/**
 * NexRig "hardware studio" building blocks: wide page shell, KPI tiles, product stage and surfaces.
 * Pages compose these differently; the tokens (globals.css) keep them one system.
 */

/** Wide content area: uses the screen on desktop instead of a narrow centred column. */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto w-full max-w-[1680px] px-4 py-6 md:px-8 md:py-8 xl:px-10", className)}>{children}</div>;
}

/** Flat surface with a hairline ring instead of a heavy frame. */
export function Surface({ children, className, as: As = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "aside" | "article" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cx("rounded-[var(--radius-xl)] bg-panel ring-1 ring-white/[0.06]", className)} {...rest}>
      {children}
    </As>
  );
}

const TONE: Record<"violet" | "cyan" | "ok" | "warn" | "bad" | "neutral", string> = {
  violet: "before:bg-violet",
  cyan: "before:bg-cyan",
  ok: "before:bg-ok",
  warn: "before:bg-warn",
  bad: "before:bg-bad",
  neutral: "before:bg-fg-3",
};

/** Key figure: small label, large number, one line of context. */
export function Kpi({
  label,
  value,
  unit,
  sub,
  tone = "neutral",
  size = "md",
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  tone?: keyof typeof TONE;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cx("relative min-w-0 pl-3.5 before:absolute before:top-1 before:bottom-1 before:left-0 before:w-[3px] before:rounded-full", TONE[tone], className)}>
      <p className="eyebrow truncate">{label}</p>
      <p className={cx("num mt-1 leading-none font-semibold tracking-tight", size === "lg" ? "text-[40px]" : "text-[26px]")}>
        {value}
        {unit && <span className={cx("ml-1 font-sans font-medium text-fg-3", size === "lg" ? "text-[17px]" : "text-[13px]")}>{unit}</span>}
      </p>
      {sub && <div className="mt-1.5 truncate text-[12.5px] text-fg-3">{sub}</div>}
    </div>
  );
}

/**
 * Product image area. The project has no product photos: the illustration is the schematic
 * vector thumbnail drawn from the product's category and colours, shown large on a studio light.
 */
export function ProductStage({ component, size = 112, className }: { component: HardwareComponent; size?: number; className?: string }) {
  return (
    <div className={cx("relative grid place-items-center overflow-hidden bg-[radial-gradient(120%_90%_at_50%_10%,#232a40_0%,#121624_55%,#0c0f18_100%)]", className)}>
      <div className="absolute inset-x-[18%] bottom-[14%] h-3 rounded-[50%] bg-black/50 blur-md" aria-hidden />
      <ComponentThumb component={component} size={size} className="relative border-0 bg-transparent" />
    </div>
  );
}

/** Empty state with a reason and next steps (never just blank space). */
export function EmptyPanel({ title, children, actions, icon }: { title: string; children?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] bg-panel/60 px-6 py-14 text-center ring-1 ring-white/[0.06] ring-inset">
      {icon && <div className="grid size-12 place-items-center rounded-full bg-violet-soft text-violet">{icon}</div>}
      <p className="text-[18px] font-semibold">{title}</p>
      {children && <div className="max-w-xl text-[14px] leading-relaxed text-fg-3">{children}</div>}
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
