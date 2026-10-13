import type { CaseSpec, MotherboardSpec } from "@/types/hardware";
import { BOARD_LAYOUTS, caseGeometry, type Vec3 } from "./layout";

/**
 * Named installation anchors. Board anchors exist only when a motherboard is mounted;
 * ram/ssd anchors exist only for slots the board actually has.
 */
export type AnchorName =
  | "case_mount"
  | "motherboard_mount"
  | "cpu_socket"
  | "cpu_cooler_mount"
  /** ram_slot_1 … ram_slot_4, limited by the board's DIMM count. */
  | `ram_slot_${number}`
  | "gpu_slot"
  | `ssd_slot_${number}`
  | `drive_bay_${number}`
  | `hdd_bay_${number}`
  | "psu_bay"
  | `fan_${number}`
  | "radiator_mount";

export interface Pose {
  position: Vec3;
  rotation: Vec3;
}

export type AnchorMap = Partial<Record<AnchorName, Pose>>;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const pose = (position: Vec3, rotation: Vec3 = [0, 0, 0]): Pose => ({ position, rotation });

export interface AnchorOptions {
  /** Fans go to the top panel when the front is used by an AIO radiator. */
  frontOccupiedByRadiator?: boolean;
}

export function resolveAnchors(pcCase: CaseSpec, board?: MotherboardSpec, opts: AnchorOptions = {}): AnchorMap {
  const g = caseGeometry(pcCase);
  const anchors: AnchorMap = {
    case_mount: pose([0, 0, 0]),
    motherboard_mount: pose(g.boardOrigin),
    psu_bay: pose([-g.depth / 2 + g.wall + 0.04, 0.1, -g.width / 2 + g.wall + 0.85]),
    radiator_mount: pose([g.depth / 2 - 0.42, (g.height + g.shroudHeight) / 2 + 0.05, 0]),
  };

  for (let i = 0; i < pcCase.drive25Bays; i++) {
    anchors[`drive_bay_${i + 1}`] = pose([g.depth / 2 - 1.55, g.shroudHeight + 0.005 + i * 0.09, 0.15]);
  }
  // 3.5″ drives sit on the shroud toward the rear, stacked like a drive cage.
  for (let i = 0; i < pcCase.drive35Bays; i++) {
    anchors[`hdd_bay_${i + 1}`] = pose([-g.depth / 2 + 0.55, g.shroudHeight + 0.005 + i * 0.3, -0.45]);
  }

  // Fans: front intake column, or along the top when the front holds a radiator.
  for (let i = 0; i < pcCase.fanSlots120; i++) {
    if (opts.frontOccupiedByRadiator) {
      anchors[`fan_${i + 1}`] = pose([-g.depth / 2 + 1.05 + i * 1.25, g.height - g.wall - 0.16, 0], [Math.PI / 2, 0, 0]);
    } else {
      anchors[`fan_${i + 1}`] = pose([g.depth / 2 - g.wall - 0.16, g.height - 0.95 - i * 1.25, 0], [0, Math.PI / 2, 0]);
    }
  }

  if (board) {
    const L = BOARD_LAYOUTS[board.formFactor];
    const o = g.boardOrigin;
    const at = (x: number, y: number, z = 0) => add(o, [x, y, z]);
    anchors.cpu_socket = pose(at(L.cpu[0], L.cpu[1]));
    // Cooler sits on top of the CPU's heat spreader.
    anchors.cpu_cooler_mount = pose(at(L.cpu[0], L.cpu[1], 0.07));
    L.dimms.slice(0, board.memorySlots).forEach(([x, y], i) => {
      anchors[`ram_slot_${i + 1}`] = pose(at(x, y));
    });
    anchors.gpu_slot = pose(at(L.pcie[0], L.pcie[1]));
    L.m2.slice(0, board.m2Slots).forEach(([x, y], i) => {
      anchors[`ssd_slot_${i + 1}`] = pose(at(x, y, 0.02));
    });
  }
  return anchors;
}

/**
 * DIMM slots used for a kit. Two modules go to A2/B2 (slots 2 and 4), as most board manuals
 * recommend for dual-channel; two-slot boards use both.
 */
export function ramSlotsFor(modules: number, boardSlots: number): number[] {
  if (boardSlots <= 2) return [1, 2].slice(0, Math.min(modules, boardSlots));
  if (modules === 1) return [2];
  if (modules === 2) return [2, 4];
  // Three modules: both A2/B2 plus A1 — channel A gets two modules (asymmetric).
  if (modules === 3) return [1, 2, 4];
  return [1, 2, 3, 4].slice(0, Math.min(modules, boardSlots));
}
