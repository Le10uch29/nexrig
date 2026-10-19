/**
 * Hardware domain model. Specs are plain data, independent of UI and the 3D renderer.
 * Lengths are millimetres, power is watts, prices are integer roubles.
 */

export type ComponentCategory =
  | "case"
  | "motherboard"
  | "cpu"
  | "cooler"
  | "ram"
  | "gpu"
  | "storage"
  | "psu"
  | "fans";

export const CATEGORY_ORDER: ComponentCategory[] = [
  "case",
  "motherboard",
  "cpu",
  "cooler",
  "ram",
  "gpu",
  "storage",
  "psu",
  "fans",
];

/**
 * LGA1151 is split: 6th/7th gen (100/200-series boards) and 8th/9th gen (300-series boards)
 * share the physical socket but are electrically incompatible, so they are modelled separately.
 */
export type CpuSocket = "AM3+" | "AM4" | "AM5" | "LGA1155" | "LGA1150" | "LGA1151" | "LGA1151-v2" | "LGA1200" | "LGA1700" | "LGA1851";
export type MemoryType = "DDR3" | "DDR4" | "DDR5";
export type BoardFormFactor = "ATX" | "mATX" | "ITX";
export type PsuFormFactor = "ATX" | "SFX";
export type PcieGen = 2 | 3 | 4 | 5;
export type GpuPowerConnector = "6pin" | "8pin" | "12V-2x6";

/** Where a value came from and how far it can be trusted. */
export type DataQuality =
  /** Transcribed from manufacturer specs into the demo set; should be re-verified before production use. */
  | "manufacturer-unverified"
  /** Approximate/representative value (partner-card dimensions, chipset-derived board specs). */
  | "approximate";

export interface PriceInfo {
  amountRub: number;
  /** Price source. "demo" means an indicative figure, not a live store offer. */
  source: "demo";
  /** ISO date the figure was entered. */
  asOf: string;
}

/** Procedural model visual hints. No external assets are referenced. */
export interface VisualSpec {
  /** Primary body colour (hex). */
  color: string;
  /** Accent colour (hex), e.g. RGB strip, fan hub, heatsink fins. */
  accent?: string;
}

interface BaseComponent<C extends ComponentCategory> {
  id: string;
  category: C;
  brand: string;
  model: string;
  /** Short display name. */
  name: string;
  price: PriceInfo;
  dataQuality: DataQuality;
  visual: VisualSpec;
  releaseYear?: number;
  /** Shown in the UI when the entry is generated from a template (e.g. partner GPU lines). */
  variantNote?: string;
  /** Finish of this SKU, when the product is sold in several colours. */
  colorway?: Colorway;
  /** Shared by colour variants of one product (black/white SKUs); the id of the primary variant. */
  variantGroup?: string;
}

export type Colorway = "black" | "white";

/** Case fan mounting positions. */
export type FanPosition = "front" | "top" | "rear" | "bottom" | "side";

/** Case fans the user wants per mount position (sum = fans installed). */
export type FanLayout = Partial<Record<FanPosition, number>>;

export interface CaseSpec extends BaseComponent<"case"> {
  supportedBoards: BoardFormFactor[];
  supportedPsu: PsuFormFactor[];
  maxGpuLengthMm: number;
  maxCpuCoolerHeightMm: number;
  /** Radiator sizes (mm) the case accepts at any position. */
  radiatorSupportMm: number[];
  /** Exterior dimensions used to build the procedural 3D shell. */
  exteriorMm: { width: number; height: number; depth: number };
  fanSlots120: number;
  drive25Bays: number;
  drive35Bays: number;
  /** Rear expansion slots (limits GPU thickness). */
  expansionSlots: number;
  /** Where radiators can go and which sizes each position takes. */
  radiatorMounts: RadiatorMount[];
  style: "mesh" | "glass-showcase" | "compact";
  /** "dual-chamber": PSU and drives behind the motherboard tray (aquarium cases), no PSU shroud. */
  layout: "classic" | "dual-chamber";
  /** Fan slots per position (120 mm), summing to fanSlots120. */
  fanMounts: Partial<Record<FanPosition, number>>;
}

export interface RadiatorMount {
  position: "front" | "top" | "side" | "bottom";
  sizesMm: number[];
}

export interface MotherboardSpec extends BaseComponent<"motherboard"> {
  socket: CpuSocket;
  chipset: string;
  formFactor: BoardFormFactor;
  memoryType: MemoryType;
  memorySlots: number;
  maxMemoryGb: number;
  m2Slots: number;
  /** Highest PCIe generation of any M.2 slot. */
  m2MaxGen: PcieGen;
  sataPorts: number;
  pcieX16Gen: PcieGen;
  /**
   * CPU families supported only after a BIOS update on boards that left the factory with older
   * firmware. The shipped BIOS version is unknown, so this yields "needs verification".
   */
  biosUpdateFamilies: string[];
  /** CPU families that fit the socket but the chipset does not support at all. */
  unsupportedFamilies: string[];
  /** Whether the chipset allows memory above the CPU's official (JEDEC) speed — XMP/EXPO. */
  memoryOverclock: boolean;
}

export interface CpuSpec extends BaseComponent<"cpu"> {
  socket: CpuSocket;
  /** Product series used for navigation, e.g. "Core i7", "Ryzen 5". */
  series: string;
  /** Generation/family, e.g. "14-е поколение", "Ryzen 7000". Used for chipset support rules. */
  family: string;
  cores: number;
  threads: number;
  baseClockGhz: number;
  boostClockGhz: number;
  /** Rated TDP / base power. */
  tdpW: number;
  /** Peak sustained package power used for PSU sizing. */
  peakPowerW: number;
  memorySupport: MemoryType[];
  /** Official (JEDEC) memory speed per supported type, MT/s. Faster kits run as an overclock. */
  memorySpeedMtps: Partial<Record<MemoryType, number>>;
  pcieGen: PcieGen;
  integratedGraphics: boolean;
  /**
   * Relative gaming throughput index (Ryzen 7 7800X3D = 100). Model parameter for estimates,
   * not a measured benchmark.
   */
  gamingIndex: number;
}

export interface CoolerSpec extends BaseComponent<"cooler"> {
  kind: "air" | "aio";
  sockets: CpuSocket[];
  /** Air coolers: total height above the CPU. AIOs: pump block height. */
  heightMm: number;
  radiatorMm?: number;
  /** Max memory module height that clears the heatsink in default fan position. Undefined = no restriction known. */
  maxRamHeightMm?: number;
  /** Manufacturer-style thermal guidance in watts, if published. */
  ratedTdpW?: number;
}

/** One memory module. The number of modules is part of the build (BuildSelection.ramCount). */
export interface RamSpec extends BaseComponent<"ram"> {
  type: MemoryType;
  line: string;
  moduleSizeGb: number;
  speedMtps: number;
  casLatency: number;
  heightMm: number;
  rgb: boolean;
}

export interface GpuSpec extends BaseComponent<"gpu"> {
  chipVendor: "NVIDIA" | "AMD";
  /** GPU chip/model, e.g. "RTX 4070 SUPER". Partner variants of one chip share it. */
  chip: string;
  /** Product line, e.g. "ROG Strix", "Founders Edition". */
  line: string;
  /** Generation used for navigation, e.g. "RTX 50", "RX 7000". */
  series: string;
  architecture: string;
  shaderUnits: number;
  boostClockMhz: number;
  vramGb: number;
  memoryType: string;
  busWidthBits: number;
  lengthMm: number;
  /** Expansion slot thickness. */
  slots: number;
  boardPowerW: number;
  powerConnectors: { type: GpuPowerConnector; count: number }[];
  recommendedPsuW: number;
  pcieGen: PcieGen;
  pcieLanes: 4 | 8 | 16;
  /** Hardware ray tracing support. */
  rayTracing: boolean;
  /** Relative raster index (RTX 4070 = 100). Model parameter for estimates, not a measurement. */
  rasterIndex: number;
  /** Relative ray-tracing index (RTX 4070 = 100); 0 without hardware RT. Model parameter. */
  rtIndex: number;
  upscalers: ("DLSS" | "FSR" | "XeSS")[];
  /** Cooler fans visible on the card (1 = blower-style). */
  fans?: number;
  /** Lighting only where the product line actually has it. */
  rgb?: boolean;
}

export interface StorageSpec extends BaseComponent<"storage"> {
  kind: "ssd" | "hdd";
  interface: "NVMe" | "SATA";
  formFactor: "M.2 2280" | "2.5in" | "3.5in";
  pcieGen?: PcieGen;
  capacityGb: number;
  readMBps: number;
  writeMBps: number;
  /** HDD only. */
  rpm?: number;
}

export interface PsuSpec extends BaseComponent<"psu"> {
  wattage: number;
  formFactor: PsuFormFactor;
  efficiency: "80+ White" | "80+ Bronze" | "80+ Gold" | "80+ Platinum" | "80+ Titanium";
  atx3: boolean;
  /** Native GPU power connectors (6+2 pin). */
  pcie8pin: number;
  native12v2x6: number;
  modular: "full" | "semi" | "none";
}

export interface FanSpec extends BaseComponent<"fans"> {
  sizeMm: 120 | 140;
  count: number;
  rgb: boolean;
  maxRpm: number;
  /** Reverse-blade version: the clean side faces out when mounted as bottom/side intake. */
  reverse?: boolean;
}

export type HardwareComponent =
  | CaseSpec
  | MotherboardSpec
  | CpuSpec
  | CoolerSpec
  | RamSpec
  | GpuSpec
  | StorageSpec
  | PsuSpec
  | FanSpec;

export type ComponentOf<C extends ComponentCategory> = Extract<HardwareComponent, { category: C }>;
