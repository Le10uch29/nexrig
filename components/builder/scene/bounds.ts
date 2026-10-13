import { BOARD_LAYOUTS, DIMM_LENGTH, MM, PSU_DIMENSIONS, SLOT_PITCH, type Vec3 } from "@/features/installation/layout";
import type { Placement } from "@/features/installation/placement";

export interface LocalBounds {
  center: Vec3;
  size: Vec3;
}

function union(boxes: LocalBounds[]): LocalBounds {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.center[i] - b.size[i] / 2);
      max[i] = Math.max(max[i], b.center[i] + b.size[i] / 2);
    }
  }
  return { center: [0, 1, 2].map((i) => (min[i] + max[i]) / 2) as Vec3, size: [0, 1, 2].map((i) => max[i] - min[i]) as Vec3 };
}

/** Axis-aligned bounds of a placed component's model in its group's local frame. */
export function boundsFor(p: Placement): LocalBounds {
  const c = p.component;
  switch (c.category) {
    case "case":
      return { center: [0, 0, 0], size: [0, 0, 0] };
    case "motherboard": {
      const L = BOARD_LAYOUTS[c.formFactor];
      return { center: [L.width / 2, -L.height / 2, 0.12], size: [L.width, L.height, 0.3] };
    }
    case "cpu":
      return { center: [0, 0, 0.04], size: [0.48, 0.52, 0.1] };
    case "cooler": {
      if (c.kind === "aio") return { center: [0, 0, 0.25], size: [0.75, 0.75, 0.55] };
      const H = c.heightMm * MM;
      return H < 0.6 ? { center: [0, 0, H / 2], size: [1, 1, H] } : { center: [0, 0, H / 2], size: [1.4, 1.32, H] };
    }
    case "ram": {
      const h = c.heightMm * MM;
      const items = p.children ?? [{ offset: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3 }];
      return union(items.map((it) => ({ center: [it.offset[0], it.offset[1], it.offset[2] + h / 2], size: [0.09, DIMM_LENGTH, h] })));
    }
    case "gpu": {
      const L = c.lengthMm * MM;
      const T = c.slots * SLOT_PITCH;
      const Hc = c.slots >= 3 ? 1.4 : 1.2;
      return { center: [L / 2, -T / 2 + 0.02, Hc / 2 + 0.06], size: [L + 0.06, T + 0.08, Hc + 0.12] };
    }
    case "storage":
      if (c.formFactor === "3.5in") return { center: [0.735, 0.13, 0.51], size: [1.5, 0.28, 1.05] };
      return c.interface === "SATA" ? { center: [0.5, 0.035, 0.35], size: [1.02, 0.09, 0.72] } : { center: [0.4, 0, 0.02], size: [0.84, 0.25, 0.06] };
    case "psu": {
      const d = PSU_DIMENSIONS[c.formFactor];
      return { center: [d.depth / 2, d.height / 2, 0], size: [d.depth + 0.02, d.height + 0.02, d.width + 0.02] };
    }
    case "fans": {
      const s = c.sizeMm * MM;
      const items = p.children ?? [];
      return union(
        items.map((it) => {
          const size: Vec3 = it.rotation[1] !== 0 ? [0.27, s, s] : it.rotation[0] !== 0 ? [s, 0.27, s] : [s, s, 0.27];
          return { center: it.offset, size };
        }),
      );
    }
  }
}
