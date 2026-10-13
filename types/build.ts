import type { ComponentCategory } from "./hardware";

/** Component ids selected for a build. Storage allows several drives. */
export interface BuildSelection {
  case: string | null;
  motherboard: string | null;
  cpu: string | null;
  cooler: string | null;
  ram: string | null;
  /** Number of identical modules of `ram` (1…board slots). */
  ramCount: number;
  gpu: string | null;
  storage: string[];
  psu: string | null;
  fans: string | null;
}

export type SingleSlotCategory = Exclude<ComponentCategory, "storage">;

export interface SavedBuild {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  selection: BuildSelection;
  /** Price snapshot at save time (demo prices). */
  totalPriceRub: number;
}

export const EMPTY_SELECTION: BuildSelection = {
  case: null,
  motherboard: null,
  cpu: null,
  cooler: null,
  ram: null,
  ramCount: 2,
  gpu: null,
  storage: [],
  psu: null,
  fans: null,
};
