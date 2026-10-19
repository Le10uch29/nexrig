import { fanCountOf, type ResolvedBuild } from "@/lib/hardware/repository";
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

/**
 * Where an AIO radiator may go: on top; only when the top cannot take it (e.g. a glass top) — on the
 * side mount. Nothing is mounted on glass, and front/bottom radiator positions are not used.
 */
export const RADIATOR_PREFERENCE: MountPosition[] = ["top", "side"];

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

export type RadiatorBlock = "length" | "gpu" | "clearance" | "drives" | "gpu-height" | "board";

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
  /** Fans placed per position. */
  placedBy: Partial<Record<FanPosition, number>>;
  /**
   * Fans each position can take in this build: the case's mounts limited by physical room (GPU,
   * radiator, drives). Front and side share one column, so together they take at most `columnSlots`.
   */
  capacity: Partial<Record<FanPosition, number>>;
  columnSlots: number;
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

  const fansRequested = fanCountOf(b);
  const fanLayout = b.fanLayout;
  const mounts = pcCase.fanMounts ?? {};
  /**
   * Glass-front (panoramic) cases: nothing is mounted on the front glass. Their "side" mount is a
   * vertical strip right of the motherboard, against the tray, with fans/radiator facing the side glass.
   */
  const glassFront = pcCase.style === "glass-showcase";
  const boardRight = boardX + layout.width;
  // Height band of an installed GPU (the card stands on edge toward the glass, so it crosses the strip).
  const gpuBand: [number, number] | null = b.gpu ? [slotY - b.gpu.slots * SLOT_PITCH - 0.04, slotY + 0.12] : null;
  /** x centre of the side strip for a part of this width, or null when the board leaves no room. */
  const sideStripX = (width: number) => {
    const x = frontInner - GAP - width / 2;
    return x - width / 2 >= boardRight + GAP ? x : null;
  };
  const hasColumn = !glassFront && (mounts.front ?? 0) + (mounts.side ?? 0) > 0;
  const gpuAllowsColumn = !b.gpu || gpuFree(FAN_STACK) >= 0;
  const wantsColumn = !fanLayout || (fanLayout.front ?? 0) + (fanLayout.side ?? 0) > 0;
  const fansCanUseFront = fansRequested > 0 && hasColumn && gpuAllowsColumn && wantsColumn;
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
      if (position === "side" && glassFront) {
        // Glass-front case: on the side strip right of the board, core against the tray, fans toward the glass.
        const top = H - wall - GAP;
        const bottom = floorBase + GAP;
        const run = top - bottom;
        const x = sideStripX(radWidth);
        const pose: Pose = { position: [x ?? frontInner - radWidth / 2, top - len / 2, g.trayZ + 0.03 + 0.14], rotation: [0, Math.PI / 2, 0] };
        if (run < len) return { position, fits: false, neededMm, availableMm: toMm(run), block: "length", pose };
        if (x === null) return { position, fits: false, neededMm: toMm(radWidth), availableMm: Math.max(0, toMm(frontInner - GAP - boardRight - GAP)), block: "board", pose };
        if (b.gpu && gpuEnd > x - radWidth / 2) {
          const free = toMm(x - radWidth / 2 - boardX);
          return { position, fits: false, neededMm: b.gpu.lengthMm, availableMm: free, block: "gpu", pose };
        }
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
    // Top/bottom rows stop before front fans only when the front column is actually used.
    // Glass-front cases: a side-strip radiator stands under the top row's front end instead.
    const sideRadX = glassFront && radPos === "side" ? radiator!.chosen!.pose.position[0] - (radiator!.fanSizeMm * MM + 0.04) / 2 : null;
    const columnStack = glassFront ? (sideRadX !== null ? frontInner - sideRadX + GAP : 0) : radColumn ? RADIATOR_STACK : columnFree && wantsColumn ? FAN_STACK : 0;

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
    // Side strip of a glass-front case: a vertical column right of the board facing the side glass,
    // below the top fans/radiator and above the bottom fans; slots behind the GPU's height are skipped.
    const sideStrip: Pose[] = [];
    const stripX = glassFront && radPos !== "side" ? sideStripX(s) : null;
    if (stripX !== null) {
      const zFan = g.trayZ + 0.01 + FAN_THICK / 2;
      // A top radiator is offset toward the glass (clear of RAM/VRM): when it starts beyond the strip's
      // depth the column can reach up under it. Top fans sit next to the tray, so the column stops below them.
      const radClear = radTop ? radTop.pose.position[2] - (radiator!.fanSizeMm * MM + 0.04) / 2 >= zFan + FAN_THICK / 2 - 1e-9 : false;
      const stripTop = H - wall - (radTop ? (radClear ? 0 : RADIATOR_STACK) : (mounts.top ?? 0) > 0 ? FAN_STACK : 0) - GAP;
      const stripBottom = floorBase + ((mounts.bottom ?? 0) > 0 ? FAN_STACK : 0) + GAP;
      for (let i = 0; ; i++) {
        const y = stripTop - s / 2 - i * pitch;
        if (y - s / 2 < stripBottom) break;
        const behindGpu = gpuBand && gpuEnd > stripX - s / 2 && y + s / 2 > gpuBand[0] && y - s / 2 < gpuBand[1];
        if (!behindGpu) sideStrip.push({ position: [stripX, y, zFan], rotation: [0, 0, 0] });
      }
    }
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
    const slotsFor: Record<FanPosition, Pose[]> = { front: glassFront ? [] : column, side: glassFront ? sideStrip : column, rear, top, bottom };
    const used = new Set<Pose>();
    const poses: Pose[] = [];
    const positions: FanPosition[] = [];
    const placedBy: Partial<Record<FanPosition, number>> = {};
    for (const pos of order) {
      // With a user layout each position takes exactly what was asked for (within the case's mounts).
      const cap = fanLayout ? Math.min(fanLayout[pos] ?? 0, mounts[pos] ?? 0) : (mounts[pos] ?? 0);
      let n = 0;
      for (const slot of slotsFor[pos]) {
        if (poses.length >= fansRequested || n >= cap) break;
        if (used.has(slot)) continue;
        used.add(slot);
        poses.push(slot);
        n++;
      }
      if (n > 0) {
        positions.push(pos);
        placedBy[pos] = n;
      }
    }
    const capacity: Partial<Record<FanPosition, number>> = {};
    for (const pos of ["front", "side", "top", "rear", "bottom"] as FanPosition[]) {
      const n = Math.min(mounts[pos] ?? 0, slotsFor[pos].length);
      if ((mounts[pos] ?? 0) > 0) capacity[pos] = n;
    }
    // Warn about the GPU only when the column would have been used before the positions we fell back to.
    const columnRank = Math.min(...(["front", "side"] as FanPosition[]).filter((p) => (mounts[p] ?? 0) > 0).map((p) => order.indexOf(p)));
    const lastUsed = Math.max(-1, ...positions.map((p) => order.indexOf(p)));
    const frontBlockedByGpu = hasColumn && !radColumn && !gpuAllowsColumn && columnRank < lastUsed;
    fans = { requested: fansRequested, poses, positions, frontBlockedByGpu, frontBlockedByRadiator: radColumn, placedBy, capacity, columnSlots: glassFront ? sideStrip.length : column.length };
  }

  // Tower cooler: from the CPU's heat spreader to the inside of the side panel.
  const coolerHeightMm = toMm(W / 2 - 0.02 - (g.trayZ + 0.07));

  return { gpu, radiator, fans, coolerHeightMm };
}

/** Offset of a pose from another position (case frame). */
export function relativeTo(p: Pose, origin: Vec3): Pose {
  return { position: [p.position[0] - origin[0], p.position[1] - origin[1], p.position[2] - origin[2]], rotation: p.rotation };
}
