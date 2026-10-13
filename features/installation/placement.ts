import type { ResolvedBuild } from "@/lib/hardware/repository";
import type { CompatibilityCheck } from "@/types/compatibility";
import type { ComponentCategory, HardwareComponent } from "@/types/hardware";
import { ramSlotsFor, resolveAnchors, type AnchorMap, type Pose } from "./anchors";
import { caseGeometry, type Vec3 } from "./layout";

export type SlotKey = Exclude<ComponentCategory, "storage"> | `storage:${string}`;

export type PlacementState = "mounted" | "parked";
export type ParkReason = "conflict" | "waiting";

export interface Placement {
  key: SlotKey;
  category: ComponentCategory;
  component: HardwareComponent;
  state: PlacementState;
  reason?: ParkReason;
  /** Human-readable reason, from the blocking check or dependency. */
  reasonText?: string;
  /** Final pose for the component group. */
  target: Pose;
  /** Where the part waits when it can't be mounted, and where install animations start. */
  bench: Pose;
  /** Child offsets (world-aligned) for multi-part groups: RAM modules, fan packs. */
  children?: { offset: Vec3; rotation: Vec3 }[];
  /** Offset from the cooler mount to the radiator (AIO). */
  radiatorOffset?: Vec3;
}

/** Checks that make physical mounting impossible. Electrical issues don't block mounting. */
const BLOCKING_RULES: Partial<Record<ComponentCategory, string[]>> = {
  motherboard: ["form-factor"],
  cpu: ["socket"],
  cooler: ["cooler-socket", "cooler-height", "radiator"],
  ram: ["memory-type", "memory-slots"],
  gpu: ["gpu-length"],
  psu: ["psu-form"],
  fans: ["fans"],
};

export const INSTALL_ORDER: ComponentCategory[] = [
  "case",
  "psu",
  "motherboard",
  "cpu",
  "ram",
  "storage",
  "cooler",
  "gpu",
  "fans",
];

/** Bench layout, to the right of the case. Upright parts face the default camera. */
const BENCH_SPOTS: Record<ComponentCategory, Vec3> = {
  case: [0, 0, 0],
  motherboard: [0.3, 0, -1.7],
  cpu: [2.3, 0, 1.8],
  cooler: [1.2, 0, 0.9],
  ram: [2.5, 0, 0.6],
  gpu: [0.2, 0, 2.4],
  storage: [2.9, 0, -0.5],
  psu: [2.9, 0, -1.9],
  fans: [3.4, 0, 1.0],
};

/** Approximate minimum y of each model in its local frame, so bench parts rest on the floor. */
const LOCAL_MIN_Y: Partial<Record<ComponentCategory, (c: HardwareComponent) => number>> = {
  motherboard: (c) => (c.category === "motherboard" ? -(c.formFactor === "ATX" ? 3.05 : c.formFactor === "mATX" ? 2.44 : 1.7) : 0),
  ram: () => -0.665,
  gpu: (c) => (c.category === "gpu" ? -(c.slots * 0.2032 + 0.02) : 0),
  fans: () => -0.6,
  cpu: () => -0.25,
  cooler: (c) => (c.category === "cooler" && c.kind === "air" ? -0.65 : -0.35),
  storage: (c) => (c.category === "storage" && c.interface === "SATA" ? 0 : -0.12),
};

export function benchPose(category: ComponentCategory, component: HardwareComponent, caseDepth: number | null, index = 0): Pose {
  const originX = (caseDepth ?? 4.4) / 2 + 1.1;
  const spot = BENCH_SPOTS[category];
  const minY = LOCAL_MIN_Y[category]?.(component) ?? 0;
  return {
    position: [originX + spot[0], -minY + 0.02 + index * 0.12, spot[2] + index * 0.35],
    rotation: [0, -0.45, 0],
  };
}

function blockingCheck(category: ComponentCategory, checks: CompatibilityCheck[]) {
  const rules = BLOCKING_RULES[category];
  if (!rules) return undefined;
  return checks.find((c) => c.status === "incompatible" && rules.includes(c.rule));
}

const WAITING = {
  case: "Сначала выберите корпус",
  board: "Ожидает установки материнской платы",
  cpu: "Ожидает установки процессора",
};

export function computePlacements(b: ResolvedBuild, checks: CompatibilityCheck[]): Placement[] {
  const caseDepth = b.case ? caseGeometry(b.case).depth : null;
  const aio = b.cooler?.kind === "aio";
  const anchors: AnchorMap = b.case ? resolveAnchors(b.case, b.motherboard, { frontOccupiedByRadiator: aio }) : {};
  const out: Placement[] = [];

  const push = (
    key: SlotKey,
    component: HardwareComponent,
    target: Pose | undefined,
    dependencyMissing: string | null,
    extra: Partial<Placement> = {},
    benchIndex = 0,
  ): Placement => {
    const bench = benchPose(component.category, component, caseDepth, benchIndex);
    const block = blockingCheck(component.category, checks);
    let p: Placement;
    if (block) {
      p = { key, category: component.category, component, state: "parked", reason: "conflict", reasonText: block.detail, target: bench, bench, ...extra };
    } else if (dependencyMissing || !target) {
      p = { key, category: component.category, component, state: "parked", reason: "waiting", reasonText: dependencyMissing ?? WAITING.board, target: bench, bench, ...extra };
    } else {
      p = { key, category: component.category, component, state: "mounted", target, bench, ...extra };
    }
    out.push(p);
    return p;
  };

  if (b.case) {
    out.push({ key: "case", category: "case", component: b.case, state: "mounted", target: anchors.case_mount!, bench: anchors.case_mount! });
  }

  const board = b.motherboard
    ? push("motherboard", b.motherboard, anchors.motherboard_mount, b.case ? null : WAITING.case)
    : undefined;
  const boardMounted = board?.state === "mounted";

  const cpu = b.cpu ? push("cpu", b.cpu, anchors.cpu_socket, boardMounted ? null : WAITING.board) : undefined;

  if (b.cooler) {
    const extra: Partial<Placement> = {};
    if (b.cooler.kind === "aio" && anchors.radiator_mount && anchors.cpu_cooler_mount) {
      const r = anchors.radiator_mount.position;
      const m = anchors.cpu_cooler_mount.position;
      extra.radiatorOffset = [r[0] - m[0], r[1] - m[1], r[2] - m[2]];
    }
    push("cooler", b.cooler, anchors.cpu_cooler_mount, cpu?.state === "mounted" ? null : WAITING.cpu, extra);
  }

  if (b.ram) {
    const modules = b.ramCount;
    const slots = b.motherboard ? ramSlotsFor(modules, b.motherboard.memorySlots) : [];
    const first = anchors[`ram_slot_${slots[0]}` as const];
    const children = slots
      .map((s) => anchors[`ram_slot_${s}` as const])
      .filter((a): a is Pose => Boolean(a))
      .map((a) => ({
        offset: [a.position[0] - first!.position[0], a.position[1] - first!.position[1], a.position[2] - first!.position[2]] as Vec3,
        rotation: a.rotation,
      }));
    const benchChildren = Array.from({ length: modules }, (_, i) => ({ offset: [i * 0.12, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3 }));
    const p = push("ram", b.ram, first, boardMounted ? null : WAITING.board, { children: children.length === modules ? children : benchChildren });
    if (p.state === "parked") p.children = benchChildren;
  }

  if (b.gpu) push("gpu", b.gpu, anchors.gpu_slot, boardMounted ? null : WAITING.board);

  let nvmeIndex = 0;
  let sataIndex = 0;
  let hddIndex = 0;
  b.storage.forEach((drive, i) => {
    if (drive.formFactor === "3.5in") {
      hddIndex++;
      const anchor = anchors[`hdd_bay_${hddIndex}`];
      const p = push(`storage:${drive.id}`, drive, anchor, b.case ? null : WAITING.case, {}, i);
      if (b.case && !anchor) {
        p.reason = "conflict";
        p.reasonText = "Нет свободного отсека 3.5″";
      }
    } else if (drive.interface === "NVMe") {
      nvmeIndex++;
      const anchor = anchors[`ssd_slot_${nvmeIndex}`];
      const p = push(`storage:${drive.id}`, drive, anchor, boardMounted ? null : WAITING.board, {}, i);
      if (boardMounted && !anchor) {
        p.reason = "conflict";
        p.reasonText = "Нет свободного слота M.2";
      }
    } else {
      sataIndex++;
      const anchor = anchors[`drive_bay_${sataIndex}`];
      const p = push(`storage:${drive.id}`, drive, anchor, b.case ? null : WAITING.case, {}, i);
      if (b.case && !anchor) {
        p.reason = "conflict";
        p.reasonText = "Нет свободного отсека 2.5″";
      }
    }
  });

  if (b.psu) push("psu", b.psu, anchors.psu_bay, b.case ? null : WAITING.case);

  if (b.fans) {
    const fanAnchors = Array.from({ length: b.fans.count }, (_, i) => anchors[`fan_${i + 1}`]).filter((a): a is Pose => Boolean(a));
    const first = fanAnchors[0];
    const mountedChildren = first
      ? fanAnchors.map((a) => ({
          offset: [a.position[0] - first.position[0], a.position[1] - first.position[1], a.position[2] - first.position[2]] as Vec3,
          rotation: a.rotation,
        }))
      : [];
    const benchChildren = Array.from({ length: b.fans.count }, (_, i) => ({ offset: [0, 0, i * 0.35] as Vec3, rotation: [0, 0, 0] as Vec3 }));
    const target = first ? { position: first.position, rotation: [0, 0, 0] as Vec3 } : undefined;
    const p = push("fans", b.fans, target, b.case ? null : WAITING.case, {
      children: mountedChildren.length === b.fans.count ? mountedChildren : benchChildren,
    });
    if (p.state === "parked") p.children = benchChildren;
  }

  return out;
}
