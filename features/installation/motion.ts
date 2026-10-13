import type { ComponentCategory, HardwareComponent } from "@/types/hardware";
import type { Pose } from "./anchors";
import type { Vec3 } from "./layout";

/**
 * Component-specific installation motion. Pure data: the renderer turns keyframes into tweens.
 *
 * `approach` is the offset from the anchor where the part is aligned before the final push,
 * so the last segment travels exactly along the insertion axis and ends on the anchor.
 */
export interface MotionProfile {
  approach: Vec3;
  /** Orientation offset while travelling, removed during alignment. */
  travelTilt: Vec3;
  /** Total seconds for a full install path. */
  duration: number;
}

export const MOTION_PROFILES: Record<ComponentCategory | "storage-sata", MotionProfile> = {
  case: { approach: [0, 0, 0], travelTilt: [0, 0, 0], duration: 0.6 },
  motherboard: { approach: [0, 0, 1.6], travelTilt: [0, 0.35, 0], duration: 1.8 },
  cpu: { approach: [0, 0, 0.8], travelTilt: [0, 0, 0.7], duration: 1.4 },
  cooler: { approach: [0, 0, 1.7], travelTilt: [0, 0, 0.5], duration: 1.6 },
  ram: { approach: [0, 0, 0.9], travelTilt: [0, 0.25, 0], duration: 1.3 },
  // PCIe insertion is perpendicular to the board: the card is aligned over the slot, then pushed in along -z.
  gpu: { approach: [0, 0, 1.25], travelTilt: [0.15, 0.55, -0.2], duration: 2.2 },
  storage: { approach: [0.3, 0, 0.3], travelTilt: [0, -0.3, 0], duration: 1.2 },
  "storage-sata": { approach: [0, 0.8, 0], travelTilt: [0, 0.4, 0], duration: 1.2 },
  psu: { approach: [0, 0, 1.9], travelTilt: [0, 0.3, 0], duration: 1.6 },
  fans: { approach: [-0.7, 0, 0], travelTilt: [0, 0, 0.3], duration: 1.3 },
};

export function profileFor(component: HardwareComponent): MotionProfile {
  if (component.category === "storage" && component.interface === "SATA") return MOTION_PROFILES["storage-sata"];
  return MOTION_PROFILES[component.category];
}

export interface Keyframe {
  position: Vec3;
  rotation: Vec3;
  /** Seconds. */
  duration: number;
  ease: "power2.inOut" | "power2.out" | "power3.in" | "sine.inOut" | "back.out(1.6)";
  label: "lift" | "travel" | "align" | "insert" | "extract" | "return";
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Path from the current pose (bench or elsewhere) to the mounted anchor. Ends exactly on `anchor`. */
export function installPath(profile: MotionProfile, from: Pose, anchor: Pose): Keyframe[] {
  const d = profile.duration;
  const pre = add(anchor.position, profile.approach);
  const travelRot = add(anchor.rotation, profile.travelTilt);
  const lifted = add(from.position, [0, 0.7, 0]);
  return [
    { position: lifted, rotation: from.rotation, duration: d * 0.18, ease: "power2.out", label: "lift" },
    { position: add(pre, [0, 0.25, 0]), rotation: travelRot, duration: d * 0.42, ease: "power2.inOut", label: "travel" },
    { position: pre, rotation: anchor.rotation, duration: d * 0.2, ease: "sine.inOut", label: "align" },
    { position: anchor.position, rotation: anchor.rotation, duration: d * 0.2, ease: "power3.in", label: "insert" },
  ];
}

/** Reverse motion: pull out along the insertion axis, then carry back to the bench. */
export function removalPath(profile: MotionProfile, from: Pose, bench: Pose, mounted: boolean): Keyframe[] {
  const d = profile.duration * 0.75;
  const frames: Keyframe[] = [];
  if (mounted) {
    frames.push({ position: add(from.position, profile.approach), rotation: from.rotation, duration: d * 0.3, ease: "power2.out", label: "extract" });
  }
  frames.push({ position: bench.position, rotation: bench.rotation, duration: d * 0.7, ease: "power2.inOut", label: "return" });
  return frames;
}

/** Exploded-view offsets (world-aligned), applied on top of the mounted pose. */
export const EXPLODE_OFFSETS: Record<ComponentCategory, Vec3> = {
  case: [0, 0, 0],
  motherboard: [0, 0, 0.35],
  cpu: [0, 0, 1.0],
  cooler: [0, 0, 2.1],
  ram: [0, 0, 1.4],
  gpu: [0, -0.15, 1.8],
  storage: [0, 0, 1.0],
  psu: [0, -0.1, 2.3],
  fans: [-0.9, 0, 0],
};
