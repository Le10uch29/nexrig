import type { BoardFormFactor, CaseSpec, PsuFormFactor } from "@/types/hardware";

/**
 * Scene units: 1 unit = 100 mm. World axes: +y up (floor at 0), +x toward the case front,
 * +z toward the open/glass side. The motherboard lies in the XY plane facing +z.
 */
export const MM = 0.01;

export type Vec3 = [number, number, number];

/**
 * Motherboard layout in board-local coordinates: origin at the top-rear corner of the PCB,
 * +x toward the front edge, -y downward, +z out of the component side.
 * Positions approximate the ATX/mATX/Mini-ITX reference layouts; shared by anchors and models.
 */
export interface BoardLayout {
  width: number;
  height: number;
  cpu: [number, number];
  /** DIMM slot centres in physical order (A1, A2, B1, B2). */
  dimms: [number, number][];
  /** Primary PCIe x16 slot line. x is the board's rear edge (card bracket position). */
  pcie: [number, number];
  /** M.2 slot connector ends; sticks extend toward +x. */
  m2: [number, number][];
  chipset: [number, number];
}

export const BOARD_LAYOUTS: Record<BoardFormFactor, BoardLayout> = {
  ATX: {
    width: 2.44,
    height: 3.05,
    cpu: [0.95, -0.85],
    dimms: [
      [1.66, -0.82],
      [1.76, -0.82],
      [1.9, -0.82],
      [2.0, -0.82],
    ],
    pcie: [0, -1.55],
    m2: [
      [0.9, -1.24],
      [0.9, -1.98],
      [0.9, -2.58],
      [0.9, -2.82],
      [1.45, -2.4],
    ],
    chipset: [1.8, -2.25],
  },
  mATX: {
    width: 2.44,
    height: 2.44,
    cpu: [0.95, -0.85],
    dimms: [
      [1.66, -0.82],
      [1.76, -0.82],
      [1.9, -0.82],
      [2.0, -0.82],
    ],
    pcie: [0, -1.55],
    m2: [
      [0.9, -1.24],
      [0.9, -2.08],
    ],
    chipset: [1.8, -2.0],
  },
  ITX: {
    width: 1.7,
    height: 1.7,
    cpu: [0.72, -0.62],
    dimms: [
      [1.42, -0.72],
      [1.52, -0.72],
    ],
    pcie: [0, -1.45],
    m2: [
      [0.22, -1.1],
      [0.22, -1.28],
    ],
    chipset: [1.3, -1.45],
  },
};

export const BOARD_THICKNESS = 0.016;
/** DIMM length along y. */
export const DIMM_LENGTH = 1.33;
/** Distance from the PCIe slot line to the card's bracket edge is 0; slot connector spans this x-range. */
export const PCIE_SLOT_RANGE: [number, number] = [0.42, 1.31];
export const SLOT_PITCH = 0.2032;

export const PSU_DIMENSIONS: Record<PsuFormFactor, { depth: number; height: number; width: number }> = {
  ATX: { depth: 1.5, height: 0.86, width: 1.5 },
  SFX: { depth: 1.0, height: 0.635, width: 1.25 },
};

/** Derived interior geometry of a case shell. */
export interface CaseGeometry {
  width: number;
  height: number;
  depth: number;
  wall: number;
  /** z of the motherboard's component-side face. */
  trayZ: number;
  shroudHeight: number;
  /** Top-rear standoff position for any board form factor. */
  boardOrigin: Vec3;
}

export function caseGeometry(c: CaseSpec): CaseGeometry {
  const width = c.exteriorMm.width * MM;
  const height = c.exteriorMm.height * MM;
  const depth = c.exteriorMm.depth * MM;
  const wall = 0.06;
  const trayZ = -width / 2 + 0.2;
  const shroudHeight = c.supportedPsu.includes("ATX") ? 1.05 : 0.8;
  return {
    width,
    height,
    depth,
    wall,
    trayZ,
    shroudHeight,
    boardOrigin: [-depth / 2 + 0.28, height - 0.32, trayZ],
  };
}
