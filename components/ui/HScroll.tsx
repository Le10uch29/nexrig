"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { IconChevron } from "./icons";
import { cx } from "./primitives";

/**
 * Horizontal scroller that is obviously scrollable: the mouse wheel scrolls it sideways,
 * edge fades and arrow buttons appear only when more content exists in that direction.
 */
export function HScroll({
  children,
  className,
  innerClassName,
  label,
  role,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  label?: string;
  role?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ResizeObserver fires once on observe, which also sets the initial edge state.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    // Vertical wheel → horizontal scroll, but only while there is room to move (non-passive to prevent page scroll).
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [update]);

  const step = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <div className={cx("relative min-w-0", className)}>
      <div ref={ref} onScroll={update} role={role} aria-label={label} className={cx("scroll-thin flex overflow-x-auto", innerClassName)}>
        {children}
      </div>
      {edges.left && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[var(--panel)] to-transparent" />
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => step(-1)}
            className="absolute top-1/2 left-1 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-line-strong bg-panel-3 text-fg shadow-pop transition-colors hover:border-violet/60 hover:text-violet"
          >
            <IconChevron className="rotate-180" width={14} height={14} />
          </button>
        </>
      )}
      {edges.right && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--panel)] to-transparent" />
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => step(1)}
            className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-line-strong bg-panel-3 text-fg shadow-pop transition-colors hover:border-violet/60 hover:text-violet"
          >
            <IconChevron width={14} height={14} />
          </button>
        </>
      )}
    </div>
  );
}
