import type { ResolvedBuild } from "@/lib/hardware/repository";
import type { FanPosition, RadiatorMount } from "@/types/hardware";
import type { Pose } from "./anchors";
import { BOARD_LAYOUTS, caseGeometry, MM, SLOT_PITCH, type Vec3 } from "./layout";

/**
 * Physical fit inside the case, in scene units (1 = 100 mm). The 3D layout and the compatibility
 * checks both use these numbers, so a part that is drawn inside the case is reported as fitting
 * and a part that would cross a panel is reported as not fitting.
 *
 * Dimensions are generic: a radiator is its fan size plus ~32 mm of end tanks, ~27 mm thick,
 * with 25 mm fans; case fans are 25 mm thick. Board-side clearances come from the shared layout.
 */

export type MountPosition = RadiatorMount["position"];

/** Preferred order: top first (exhausts heat, keeps the front free for the GPU and intake). */
export const RADIATOR_PREFERENCE: MountPosition[] = ["top", "front", "side", "bottom"];

const RAD_THICK = 0.27;
const FAN_THICK = 0.25;
/** Radiator plus fans plus a small gap. */
export const RADIATOR_STACK = RAD_THICK + FAN_THICK + 0.04;
/** Case fan plus gap. */
export const FAN_STACK = 0.27 + 0.03;
const TANKS = 0.32;
const GAP = 0.02;

/** Board-side parts under a top radiator: VRM heatsink and EPS connector height above the PCB. */
const BOARD_TOP_CLEARANCE = 0.26;

export type RadiatorBlock = "length" | "gpu" | "clearance" | "drives" | "gpu-height";

export interface RadiatorOption {
  position: MountPosition;
  fits: boolean;
  /** Space the radiator needs along its length, mm. */
  neededMm: number;
  /** Space available along that direction (or the competing limit), mm. */
  availableMm: number;
  block?: RadiatorBlock;
  /** Radiator centre in the case frame and model rotation (model's length runs along local y). */
  pose: Pose;
}

export interface RadiatorFit {
  sizeMm: number;
  fanSizeMm: 120 | 140;
  lengthMm: number;
  /** Positions the case supports for this size, in preference order, with their physical fit. */
  options: RadiatorOption[];
  chosen?: RadiatorOption;
}

export interface GpuFit {
  lengthMm: number;
  /** Free length from the slot bracket to the inside of the front panel, mm. */
  interiorMm: number;
  fits: boolean;
}

export interface FanFit {
  requested: number;
  poses: Pose[];
  /** Mount positions used, in placement order. */
  positions: FanPosition[];
  /** Front/side column was skipped because the GPU is too long for fans in front of it. */
  frontBlockedByGpu: boolean;
  /** Front/side column is taken by the radiator. */
  frontBlockedByRadiator: boolean;
}

/** Placement order: classic cases pull air in at the front; aquarium cases at the bottom and side. */
const FAN_ORDER: Record<"classic" | "dual-chamber", FanPosition[]> = {
  classic: ["front", "side", "rear", "top", "bottom"],
  "dual-chamber": ["bottom", "side", "front", "rear", "top"],
};

export interface BuildFit {
  gpu?: GpuFit;
  radiator?: RadiatorFit;
  fans?: FanFit;
  /** Max tower cooler height from the tray to the side panel, mm. */
  coolerHeightMm: number;
}

export function radiatorFanSize(sizeMm: number): 120 | 140 {
  return sizeMm % 140 === 0 ? 140 : 120;
}

const toMm = (u: number) => Math.round(u / MM);

export function computeFit(b: ResolvedBuild): BuildFit | null {
  const pcCase = b.case;
  if (!pcCase) return null;
  const g = caseGeometry(pcCase);
  const { width: W, height: H, depth: D, wall } = g;
  const layout = BOARD_LAYOUTS[b.motherboard?.formFactor ?? pcCase.supportedBoards[0] ?? "ATX"];
  const boardX = g.boardOrigin[0];
  const slotY = g.boardOrigin[1] + layout.pcie[1];
  const frontInner = D / 2 - wall;
  const glassInner = W / 2 - 0.04;

  // GPU: bracket at the board's rear edge, card extends toward the front.
  const gpuLen = b.gpu ? b.gpu.lengthMm * MM : 0;
  const gpuEnd = boardX + gpuLen;
  const gpuFree = (stack: number) => frontInner - stack - GAP / 2 - gpuEnd;
  const gpu: GpuFit | undefined = b.gpu
    ? { lengthMm: b.gpu.lengthMm, interiorMm: toMm(frontInner - GAP / 2 - boardX), fits: gpuFree(0) >= 0 }
    : undefined;

  const fansRequested = b.fans?.count ?? 0;
  const mounts = pcCase.fanMounts ?? {};
  const hasColumn = (mounts.front ?? 0) + (mounts.side ?? 0) > 0;
  const gpuAllowsColumn = !b.gpu || gpuFree(FAN_STACK) >= 0;
  const fansCanUseFront = fansRequested > 0 && hasColumn && gpuAllowsColumn;
  const hasFloorDrives = b.storage.some((d) => d.interface === "SATA") && !g.dualChamber;
  const gpuBottom = b.gpu ? slotY - b.gpu.slots * SLOT_PITCH - 0.04 : Infinity;
  const floorBase = (g.shroudHeight > 0 ? g.shroudHeight + wall / 2 : wall) + 0.005;
  /** z centre for a part of this width in the main chamber (clear of the tray), or null if it can't fit. */
  const mainZ = (width: number) => {
    const z = Math.max(0, g.trayZ + 0.05 + width / 2);
    return z + width / 2 <= glassInner + 1e-9 ? z : null;
  };

  // Radiator options.
  let radiator: RadiatorFit | undefined;
  if (b.cooler?.kind === "aio" && b.cooler.radiatorMm) {
    const size = b.cooler.radiatorMm;
    const fanSize = radiatorFanSize(size);
    const len = size * MM + TANKS;
    const radWidth = fanSize * MM + 0.04;
    const ramH = b.ram && b.motherboard ? b.ram.heightMm * MM : 0;
    const supported = RADIATOR_PREFERENCE.filter((p) => pcCase.radiatorMounts.some((m) => m.position === p && m.sizesMm.includes(size)));

    const option = (position: MountPosition): RadiatorOption => {
      const neededMm = toMm(len);
      if (position === "top") {
        // Under the top panel, fans hanging down; front end stops before front fans.
        const frontLimit = frontInner - (fansCanUseFront ? FAN_STACK : 0) - GAP;
        const rearLimit = -D / 2 + wall + GAP;
        const run = frontLimit - rearLimit;
        const y = H - wall - 0.01 - RAD_THICK / 2;
        // Offset toward the side panel so the fans clear RAM, VRM heatsinks and the EPS plug.
        const zStart = g.trayZ + Math.max(BOARD_TOP_CLEARANCE, ramH + 0.03);
        const z = Math.max(0, zStart + radWidth / 2);
        const pose: Pose = { position: [frontLimit - len / 2, y, z], rotation: [0, 0, Math.PI / 2] };
        if (run < len) return { position, fits: false, neededMm, availableMm: toMm(run), block: "length", pose };
        if (z + radWidth / 2 > glassInner) return { position, fits: false, neededMm: toMm(radWidth), availableMm: toMm(glassInner - zStart), block: "clearance", pose };
        return { position, fits: true, neededMm, availableMm: toMm(run), pose };
      }
      if (position === "bottom") {
        const base = floorBase;
        const frontLimit = frontInner - (fansCanUseFront ? FAN_STACK : 0) - GAP;
        const rearLimit = -D / 2 + wall + GAP;
        const run = frontLimit - rearLimit;
        const z = mainZ(radWidth);
        const pose: Pose = { position: [rearLimit + run / 2, base + RAD_THICK / 2, z ?? 0], rotation: [0, 0, -Math.PI / 2] };
        if (run < len) return { position, fits: false, neededMm, availableMm: toMm(run), block: "length", pose };
        if (z === null) return { position, fits: false, neededMm: toMm(radWidth), availableMm: toMm(glassInner - g.trayZ), block: "clearance", pose };
        if (hasFloorDrives) return { position, fits: false, neededMm, availableMm: toMm(run), block: "drives", pose };
        const top = base + RADIATOR_STACK;
        if (top > gpuBottom) return { position, fits: false, neededMm: toMm(RADIATOR_STACK), availableMm: Math.max(0, toMm(gpuBottom - base)), block: "gpu-height", pose };
        return { position, fits: true, neededMm, availableMm: toMm(run), pose };
      }
      // Front, or a side intake position: vertical at the front of the case, fans facing inward.
      const top = H - wall - GAP;
      const bottom = wall + GAP;
      const run = top - bottom;
      const z = mainZ(radWidth);
      const pose: Pose = { position: [frontInner - 0.005 - RAD_THICK / 2, top - len / 2, z ?? 0], rotation: [0, 0, 0] };
      if (run < len) return { position, fits: false, neededMm, availableMm: toMm(run), block: "length", pose };
      if (z === null) return { position, fits: false, neededMm: toMm(radWidth), availableMm: toMm(glassInner - g.trayZ), block: "clearance", pose };
      if (b.gpu) {
        // Stricter of the 3D space and the manufacturer's GPU limit minus the radiator stack (~55 mm).
        const free = Math.min(toMm(frontInner - RADIATOR_STACK - GAP / 2 - boardX), pcCase.maxGpuLengthMm - 55);
        if (b.gpu.lengthMm > free) return { position, fits: false, neededMm: b.gpu.lengthMm, availableMm: free, block: "gpu", pose };
      }
      return { position, fits: true, neededMm, availableMm: toMm(run), pose };
    };

    const options = supported.map(option);
    radiator = { sizeMm: size, fanSizeMm: fanSize, lengthMm: toMm(len), options, chosen: options.find((o) => o.fits) };
  }

  // Case fans, by the case's mount positions. Each position has its own slots and capacity.
  let fans: FanFit | undefined;
  if (fansRequested > 0) {
    const radPos = radiator?.chosen?.position;
    const radColumn = radPos === "front" || radPos === "side";
    const s = (b.fans?.sizeMm ?? 120) * MM;
    const pitch = s + 0.05;
    const z = mainZ(s);
    const columnFree = hasColumn && !radColumn && gpuAllowsColumn;
    const columnStack = radColumn ? RADIATOR_STACK : columnFree ? FAN_STACK : 0;

    // Physical slots per position (front and side share the vertical column at the front).
    const column: Pose[] = [];
    if (columnFree && z !== null) {
      for (let i = 0; ; i++) {
        const y = H - 0.35 - s / 2 - i * pitch;
        if (y - s / 2 < wall + GAP) break;
        column.push({ position: [frontInner - 0.16, y, z], rotation: [0, Math.PI / 2, 0] });
      }
    }
    const radTop = radiator?.chosen?.position === "top" ? radiator.chosen : undefined;
    // A top radiator's rear end blocks the rear exhaust when it reaches the back panel.
    const rearBlocked = radTop ? radTop.pose.position[0] - radiator!.lengthMm * MM / 2 < -D / 2 + wall + 0.35 : false;
    const rear: Pose[] = [];
    const rearZ = g.trayZ + 0.35 + s / 2;
    if (!rearBlocked && rearZ + s / 2 <= glassInner) {
      for (let i = 0; ; i++) {
        const y = H - 0.35 - s / 2 - i * pitch;
        if (y - s / 2 < slotY + 0.12) break;
        rear.push({ position: [-D / 2 + wall + 0.16, y, rearZ], rotation: [0, Math.PI / 2, 0] });
      }
    }
    const top: Pose[] = [];
    if (!radTop && z !== null) {
      const limit = frontInner - columnStack - GAP;
      for (let i = 0; ; i++) {
        const x = -D / 2 + 0.45 + s / 2 + i * pitch;
        if (x + s / 2 > limit) break;
        top.push({ position: [x, H - wall - 0.16, z], rotation: [Math.PI / 2, 0, 0] });
      }
    }
    const bottom: Pose[] = [];
    const bottomY = floorBase + 0.135;
    if (radPos !== "bottom" && z !== null && !hasFloorDrives && bottomY + 0.135 + GAP <= gpuBottom) {
      const limit = frontInner - columnStack - GAP;
      for (let i = 0; ; i++) {
        const x = limit - s / 2 - i * pitch;
        if (x - s / 2 < -D / 2 + wall + GAP) break;
        bottom.push({ position: [x, bottomY, z], rotation: [Math.PI / 2, 0, 0] });
      }
    }

    // Reverse-blade fans are meant for bottom/side intake: try those first.
    const order = b.fans?.reverse ? (["bottom", "side", ...FAN_ORDER[pcCase.layout].filter((p) => p !== "bottom" && p !== "side")] as FanPosition[]) : FAN_ORDER[pcCase.layout];
    const slotsFor: Record<FanPosition, Pose[]> = { front: column, side: column, rear, top, bottom };
    const used = new Set<Pose>();
    const poses: Pose[] = [];
    const positions: FanPosition[] = [];
    for (const pos of order) {
      const cap = mounts[pos] ?? 0;
      let n = 0;
      for (const slot of slotsFor[pos]) {
        if (poses.length >= fansRequested || n >= cap) break;
        if (used.has(slot)) continue;
        used.add(slot);
        poses.push(slot);
        n++;
      }
      if (n > 0) positions.push(pos);
    }
    // Warn about the GPU only when the column would have been used before the positions we fell back to.
    const columnRank = Math.min(...(["front", "side"] as FanPosition[]).filter((p) => (mounts[p] ?? 0) > 0).map((p) => order.indexOf(p)));
    const lastUsed = Math.max(-1, ...positions.map((p) => order.indexOf(p)));
    const frontBlockedByGpu = hasColumn && !radColumn && !gpuAllowsColumn && columnRank < lastUsed;
    fans = { requested: fansRequested, poses, positions, frontBlockedByGpu, frontBlockedByRadiator: radColumn };
  }

  // Tower cooler: from the CPU's heat spreader to the inside of the side panel.
  const coolerHeightMm = toMm(W / 2 - 0.02 - (g.trayZ + 0.07));

  return { gpu, radiator, fans, coolerHeightMm };
}

/** Offset of a pose from another position (case frame). */
export function relativeTo(p: Pose, origin: Vec3): Pose {
  return { position: [p.position[0] - origin[0], p.position[1] - origin[1], p.position[2] - origin[2]], rotation: p.rotation };
}
