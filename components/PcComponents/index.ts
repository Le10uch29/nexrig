import type { HardwareComponent } from "@/types/hardware";
import { CASE_FANS } from "./CaseFans";
import { CPU_AMD } from "./CpuAmd";
import { CPU_COOLERS } from "./CpuCoolers";
import { CPU_INTEL } from "./CpuIntel";
import { GPU_AMD } from "./GpuAmd";
import { GPU_NVIDIA } from "./GpuNvidia";
import { HDD } from "./Hdd";
import { MOTHERBOARDS } from "./MotherBoard";
import { PC_CASES } from "./PcCase";
import { POWER_BLOCKS } from "./PowerBlock";
import { RAM } from "./Ram";
import { SSD } from "./Ssd";

/**
 * Full local hardware catalogue (demo data — see shared.ts for provenance rules).
 * Each file is one product group; arrays are pre-sorted within the group.
 */
export { CASE_FANS, CPU_AMD, CPU_COOLERS, CPU_INTEL, GPU_AMD, GPU_NVIDIA, HDD, MOTHERBOARDS, PC_CASES, POWER_BLOCKS, RAM, SSD };

export const ALL_COMPONENTS: HardwareComponent[] = [
  ...PC_CASES,
  ...MOTHERBOARDS,
  ...CPU_INTEL,
  ...CPU_AMD,
  ...CPU_COOLERS,
  ...RAM,
  ...GPU_NVIDIA,
  ...GPU_AMD,
  ...SSD,
  ...HDD,
  ...POWER_BLOCKS,
  ...CASE_FANS,
];
