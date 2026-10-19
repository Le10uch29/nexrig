import type { ReactNode } from "react";
import type { ComponentCategory } from "@/types/hardware";

/** Line glyphs per category, drawn on a 24×24 grid with `currentColor` strokes. */
const PATHS: Record<ComponentCategory, ReactNode> = {
  cpu: <path d="M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />,
  gpu: (
    <>
      <rect x="2.5" y="7" width="19" height="10" rx="1.5" />
      <circle cx="8.5" cy="12" r="2.6" />
      <circle cx="15.5" cy="12" r="2.6" />
      <path d="M5 17v2.5" />
    </>
  ),
  ram: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="1" />
      <path d="M7 16v3M11 16v3M15 16v3M7 11h2M11 11h2M15 11h2" />
    </>
  ),
  storage: (
    <>
      <rect x="3" y="9" width="18" height="6" rx="1" />
      <circle cx="17.5" cy="12" r="0.8" />
      <path d="M6 12h6" />
    </>
  ),
  cooler: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 12c0-4 2-5.5 4-5M12 12c4 0 5.5 2 5 4M12 12c0 4-2 5.5-4 5M12 12c-4 0-5.5-2-5-4" />
    </>
  ),
  psu: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <circle cx="9" cy="12" r="3.5" />
      <path d="M16 10h2M16 14h2" />
    </>
  ),
  motherboard: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <rect x="8" y="8" width="5" height="5" />
      <path d="M16 8v8M8 16h5" />
    </>
  ),
  case: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="1.5" />
      <circle cx="12" cy="16" r="2.5" />
      <path d="M9 6h6" />
    </>
  ),
  fans: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <circle cx="12" cy="12" r="5.5" />
      <path d="M12 12c0-2.6 1.3-3.6 2.6-3.3M12 12c2.6 0 3.6 1.3 3.3 2.6M12 12c0 2.6-1.3 3.6-2.6 3.3M12 12c-2.6 0-3.6-1.3-3.3-2.6" />
    </>
  ),
};

export function CategoryIcon({ category, size = 18, className }: { category: ComponentCategory; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {PATHS[category]}
    </svg>
  );
}
