import type { ComponentCategory, HardwareComponent } from "@/types/hardware";
import { cx } from "@/components/ui/primitives";

/**
 * Vector thumbnails generated from the component's category and visual colours.
 * They are schematic illustrations, not product photos.
 */
export function ComponentThumb({
  component,
  category,
  size = 44,
  className,
}: {
  component?: HardwareComponent;
  category?: ComponentCategory;
  size?: number;
  className?: string;
}) {
  const cat = component?.category ?? category ?? "case";
  const body = component?.visual.color ?? "#2a3044";
  const accent = component?.visual.accent ?? "#8d7dff";
  const muted = !component;
  return (
    <div
      className={cx(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border border-line bg-[radial-gradient(circle_at_30%_20%,#1c2233,#0d111b)]",
        muted && "opacity-50",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 48 48" width={size * 0.78} height={size * 0.78}>
        {component?.category === "storage" && component.kind === "hdd" ? hddGlyph(body) : renderGlyph(cat, body, accent)}
      </svg>
    </div>
  );
}

function hddGlyph(body: string) {
  return (
    <g>
      <rect x="8" y="6" width="32" height="36" rx="2" fill={body} stroke="#4a5571" />
      <circle cx="24" cy="21" r="10" fill="#c9ccd4" stroke="#6b7385" />
      <circle cx="24" cy="21" r="2" fill="#4a5571" />
      <path d="M34 34 26 23" stroke="#2a3044" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function renderGlyph(cat: ComponentCategory, body: string, accent: string) {
  const stroke = "#4a5571";
  switch (cat) {
    case "case":
      return (
        <g>
          <rect x="12" y="5" width="24" height="38" rx="2.5" fill={body} stroke={stroke} />
          <rect x="15" y="8" width="13" height="32" rx="1" fill="#0b0e16" opacity="0.7" />
          <rect x="30" y="9" width="3" height="28" rx="1" fill={accent} opacity="0.6" />
          <rect x="14" y="43" width="4" height="2" fill={stroke} />
          <rect x="30" y="43" width="4" height="2" fill={stroke} />
        </g>
      );
    case "motherboard":
      return (
        <g>
          <rect x="7" y="6" width="34" height="36" rx="1.5" fill={body} stroke={stroke} />
          <rect x="13" y="12" width="10" height="10" rx="1" fill="#9aa1af" />
          <rect x="27" y="10" width="2" height="16" fill={accent} />
          <rect x="31" y="10" width="2" height="16" fill={accent} />
          <rect x="10" y="30" width="26" height="2.5" fill="#0b0e16" />
          <rect x="10" y="36" width="20" height="2" fill="#0b0e16" />
          <rect x="8" y="7" width="4" height="12" fill={accent} opacity="0.5" />
        </g>
      );
    case "cpu":
      return (
        <g>
          <rect x="10" y="10" width="28" height="28" rx="2.5" fill="#1d4d3a" stroke={stroke} />
          <rect x="14" y="14" width="20" height="20" rx="2" fill={body} />
          <path d="M18 20h12M18 24h12M18 28h8" stroke="#6b7385" strokeWidth="1" />
        </g>
      );
    case "cooler":
      return (
        <g>
          <rect x="11" y="6" width="26" height="30" rx="1.5" fill={body} stroke={stroke} />
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x="12" y={8 + i * 3.5} width="24" height="1.2" fill="#0b0e16" opacity="0.35" />
          ))}
          <rect x="14" y="36" width="20" height="5" fill="#8a8f99" />
          <path d="M18 36v6M24 36v6M30 36v6" stroke="#c48a52" strokeWidth="1.5" />
        </g>
      );
    case "ram":
      return (
        <g>
          <rect x="5" y="15" width="38" height="16" rx="1.5" fill={body} stroke={stroke} />
          <rect x="5" y="13" width="38" height="3" rx="1" fill={accent} opacity="0.85" />
          <rect x="7" y="31" width="34" height="3" fill="#c9a24a" />
          <rect x="22" y="31" width="2" height="3" fill="#0b0e16" />
        </g>
      );
    case "gpu":
      return (
        <g>
          <rect x="3" y="14" width="42" height="18" rx="2" fill={body} stroke={stroke} />
          <circle cx="15" cy="23" r="6.5" fill="#0b0e16" stroke={accent} strokeWidth="1" />
          <circle cx="33" cy="23" r="6.5" fill="#0b0e16" stroke={accent} strokeWidth="1" />
          <circle cx="15" cy="23" r="1.6" fill={accent} />
          <circle cx="33" cy="23" r="1.6" fill={accent} />
          <rect x="10" y="32" width="18" height="3" fill="#c9a24a" />
        </g>
      );
    case "storage":
      return (
        <g>
          <rect x="6" y="18" width="36" height="12" rx="1.5" fill={body} stroke={stroke} />
          <rect x="16" y="20" width="16" height="8" rx="1" fill={accent} opacity="0.8" />
          <rect x="6" y="20" width="3" height="8" fill="#c9a24a" />
        </g>
      );
    case "psu":
      return (
        <g>
          <rect x="7" y="11" width="34" height="26" rx="2" fill={body} stroke={stroke} />
          <circle cx="24" cy="24" r="9" fill="#0b0e16" stroke="#3a4257" />
          <path d="M16 24h16M24 16v16M18.5 18.5l11 11M29.5 18.5l-11 11" stroke="#3a4257" />
          <rect x="35" y="14" width="3" height="5" fill={accent} />
        </g>
      );
    case "fans":
      return (
        <g>
          <rect x="7" y="7" width="34" height="34" rx="4" fill={body} stroke={stroke} />
          <circle cx="24" cy="24" r="14" fill="#0b0e16" stroke={accent} strokeWidth="1.2" />
          {Array.from({ length: 7 }, (_, i) => (
            <path
              key={i}
              d="M24 24c2-5 6-8 9-8"
              stroke="#6b7385"
              strokeWidth="2"
              fill="none"
              transform={`rotate(${(360 / 7) * i} 24 24)`}
            />
          ))}
          <circle cx="24" cy="24" r="3.5" fill={accent} />
        </g>
      );
  }
}
