"use client";

import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useMessages } from "@/lib/i18n";
import type { CheckStatus } from "@/types/compatibility";
import { IconAlert, IconCheck, IconHelp, IconX } from "./icons";

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-violet-strong text-white hover:bg-violet border border-transparent shadow-[0_6px_18px_-8px_var(--violet-strong)]",
  secondary: "bg-panel-2 text-fg border border-line hover:border-line-strong hover:bg-panel-3",
  ghost: "bg-transparent text-fg-2 border border-transparent hover:text-fg hover:bg-panel-2",
  danger: "bg-transparent text-bad border border-line hover:bg-bad-soft hover:border-bad/40",
};
const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-[var(--radius-sm)]",
  md: "h-9 px-3.5 text-sm gap-2 rounded-[var(--radius-md)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cx(
          "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45",
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...rest}
      />
    );
  },
);

export function IconButton({
  label,
  active,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx(
        "inline-flex size-8 items-center justify-center rounded-[var(--radius-sm)] border transition-colors duration-150",
        active ? "border-violet/50 bg-violet-soft text-violet" : "border-line bg-panel/80 text-fg-2 hover:text-fg hover:border-line-strong",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export const STATUS_STYLE: Record<CheckStatus | "unchecked", { cls: string; dot: string }> = {
  compatible: { cls: "text-ok bg-ok-soft border-ok/25", dot: "bg-ok" },
  incompatible: { cls: "text-bad bg-bad-soft border-bad/30", dot: "bg-bad" },
  warning: { cls: "text-warn bg-warn-soft border-warn/30", dot: "bg-warn" },
  unknown: { cls: "text-fg-2 bg-info-soft border-line-strong", dot: "bg-fg-3" },
  unchecked: { cls: "text-fg-3 bg-transparent border-line", dot: "bg-fg-3" },
};

export function StatusIcon({ status, className }: { status: CheckStatus; className?: string }) {
  const Icon = status === "compatible" ? IconCheck : status === "incompatible" ? IconX : status === "warning" ? IconAlert : IconHelp;
  return <Icon className={className} />;
}

export function StatusPill({ status, label, size = "sm" }: { status: CheckStatus | "unchecked"; label?: string; size?: "xs" | "sm" }) {
  const t = useMessages();
  const text = label ?? (status === "unchecked" ? "Нет связей" : t.status[status]);
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
        size === "xs" ? "h-5 px-2 text-[10.5px]" : "h-6 px-2.5 text-xs",
        STATUS_STYLE[status].cls,
      )}
    >
      <span className={cx("size-1.5 rounded-full", STATUS_STYLE[status].dot)} aria-hidden />
      {text}
    </span>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "violet" | "cyan" | "warn"; className?: string }) {
  const tones = {
    neutral: "border-line text-fg-2 bg-panel-2",
    violet: "border-violet/30 text-violet bg-violet-soft",
    cyan: "border-cyan/30 text-cyan bg-cyan-soft",
    warn: "border-warn/30 text-warn bg-warn-soft",
  };
  return (
    <span className={cx("inline-flex h-5 items-center rounded-[5px] border px-1.5 text-[10.5px] font-semibold tracking-wide uppercase", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[var(--radius-md)] border border-line bg-bg-1 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-[7px] font-medium transition-colors duration-150 disabled:opacity-40",
            size === "sm" ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-xs",
            value === o.value ? "bg-panel-3 text-fg shadow-[0_0_0_1px_var(--line-strong)]" : "text-fg-3 hover:text-fg-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={cx("inline-flex items-center gap-2 text-xs text-fg-2 select-none", disabled ? "opacity-45" : "cursor-pointer")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-[18px] w-8 shrink-0 rounded-full border transition-colors duration-150",
          checked ? "border-violet/60 bg-violet-strong" : "border-line-strong bg-panel-3",
        )}
      >
        <span
          className={cx(
            "absolute top-[2px] left-0 size-3 rounded-full bg-white transition-transform duration-150",
            checked ? "translate-x-[15px]" : "translate-x-[2px]",
          )}
        />
      </button>
      {label}
    </label>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-wide text-fg-3 uppercase">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-fg-3">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "h-9 w-full rounded-[var(--radius-md)] border border-line bg-bg-1 px-3 text-sm text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-violet/60";

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className={cx(inputCls, "pr-8")}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase">{children}</h2>
      {aside}
    </div>
  );
}

/** Accessible modal built on <dialog>: focus trap, Escape to close, backdrop click to close. */
export function Dialog({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={cx("m-auto rounded-[var(--radius-lg)] border border-line-strong bg-panel p-0 text-fg shadow-pop backdrop:bg-black/60 backdrop:backdrop-blur-[2px]", className ?? "w-[min(520px,calc(100vw-32px))]")}
    >
      {open && (
        <div className="animate-in p-5">
          <h2 className="mb-3 text-base font-semibold">{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="text-fg-3">{icon}</div>}
      <p className="text-sm font-medium text-fg-2">{title}</p>
      {children && <div className="max-w-sm text-xs leading-relaxed text-fg-3">{children}</div>}
    </div>
  );
}
