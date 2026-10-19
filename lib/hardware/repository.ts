import { ALL_COMPONENTS } from "@/components/PcComponents";
import type { BuildSelection } from "@/types/build";
import type { ComponentCategory, ComponentOf, FanLayout, FanPosition, HardwareComponent } from "@/types/hardware";

/**
 * Read access to hardware data. The local implementation serves the bundled demo dataset;
 * a database-backed implementation (see supabase/migrations) can implement the same interface.
 */
export interface HardwareRepository {
  readonly source: "local-demo" | "database";
  all(): HardwareComponent[];
  byId(id: string | null | undefined): HardwareComponent | undefined;
  byCategory<C extends ComponentCategory>(category: C): ComponentOf<C>[];
  search(query: string, limit?: number): HardwareComponent[];
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[\s_\-–—]+/g, " ").trim();
}

class LocalHardwareRepository implements HardwareRepository {
  readonly source = "local-demo" as const;
  private readonly index = new Map<string, HardwareComponent>(ALL_COMPONENTS.map((c) => [c.id, c]));

  all() {
    return ALL_COMPONENTS;
  }

  byId(id: string | null | undefined) {
    return id ? this.index.get(id) : undefined;
  }

  byCategory<C extends ComponentCategory>(category: C): ComponentOf<C>[] {
    return ALL_COMPONENTS.filter((c): c is ComponentOf<C> => c.category === category);
  }

  search(query: string, limit = 20) {
    const terms = normalize(query).split(" ").filter(Boolean);
    if (terms.length === 0) return [];
    return ALL_COMPONENTS.filter((c) => {
      const hay = normalize(`${c.brand} ${c.model} ${c.name} ${c.id}`);
      return terms.every((t) => hay.includes(t));
    }).slice(0, limit);
  }
}

export const hardwareRepository: HardwareRepository = new LocalHardwareRepository();

/** Resolved component objects for a selection. */
export interface ResolvedBuild {
  case?: ComponentOf<"case">;
  motherboard?: ComponentOf<"motherboard">;
  cpu?: ComponentOf<"cpu">;
  cooler?: ComponentOf<"cooler">;
  ram?: ComponentOf<"ram">;
  /** Number of `ram` modules installed. */
  ramCount: number;
  gpu?: ComponentOf<"gpu">;
  storage: ComponentOf<"storage">[];
  psu?: ComponentOf<"psu">;
  fans?: ComponentOf<"fans">;
  /** User's fans per position; absent = the whole pack, placed automatically. */
  fanLayout?: FanLayout;
}

export const FAN_POSITIONS: FanPosition[] = ["front", "side", "top", "rear", "bottom"];
export const MAX_FANS_PER_POSITION = 8;

/** Valid per-position counts only; an all-zero or malformed layout means "automatic". */
export function normalizeFanLayout(layout: unknown): FanLayout | undefined {
  if (!layout || typeof layout !== "object") return undefined;
  const out: FanLayout = {};
  for (const p of FAN_POSITIONS) {
    const n = (layout as Record<string, unknown>)[p];
    if (typeof n === "number" && Number.isInteger(n) && n > 0 && n <= MAX_FANS_PER_POSITION) out[p] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

export function fanLayoutTotal(layout: FanLayout | undefined) {
  return layout ? FAN_POSITIONS.reduce((s, p) => s + (layout[p] ?? 0), 0) : 0;
}

/** Case fans installed: the layout's total, or the whole pack without a layout. */
export function fanCountOf(b: Pick<ResolvedBuild, "fans" | "fanLayout">): number {
  if (!b.fans) return 0;
  return b.fanLayout ? fanLayoutTotal(b.fanLayout) : b.fans.count;
}

/** Packs to buy for the installed fans (the price in the catalog is per pack). */
export function fanPacksOf(b: Pick<ResolvedBuild, "fans" | "fanLayout">): number {
  if (!b.fans) return 0;
  return Math.max(1, Math.ceil(fanCountOf(b) / Math.max(1, b.fans.count)));
}

/** Older saved builds have no ramCount; they were 2-module kits. */
export function normalizeRamCount(n: unknown): number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 8 ? n : 2;
}

function pick<C extends ComponentCategory>(
  repo: HardwareRepository,
  id: string | null,
  category: C,
): ComponentOf<C> | undefined {
  const c = repo.byId(id);
  return c && c.category === category ? (c as ComponentOf<C>) : undefined;
}

export function resolveBuild(selection: BuildSelection, repo: HardwareRepository = hardwareRepository): ResolvedBuild {
  const fans = pick(repo, selection.fans, "fans");
  return {
    fanLayout: fans ? normalizeFanLayout(selection.fanLayout) : undefined,
    case: pick(repo, selection.case, "case"),
    motherboard: pick(repo, selection.motherboard, "motherboard"),
    cpu: pick(repo, selection.cpu, "cpu"),
    cooler: pick(repo, selection.cooler, "cooler"),
    ram: pick(repo, selection.ram, "ram"),
    ramCount: normalizeRamCount(selection.ramCount),
    gpu: pick(repo, selection.gpu, "gpu"),
    storage: selection.storage
      .map((id) => pick(repo, id, "storage"))
      .filter((s): s is ComponentOf<"storage"> => Boolean(s)),
    psu: pick(repo, selection.psu, "psu"),
    fans,
  };
}

export function selectedComponents(build: ResolvedBuild): HardwareComponent[] {
  const list: (HardwareComponent | undefined)[] = [
    build.case,
    build.motherboard,
    build.cpu,
    build.cooler,
    build.ram,
    build.gpu,
    ...build.storage,
    build.psu,
    build.fans,
  ];
  return list.filter((c): c is HardwareComponent => Boolean(c));
}

/** Total demo price; memory is priced per module × ramCount, fans per pack × packs needed. */
export function totalPrice(build: ResolvedBuild): number {
  return selectedComponents(build).reduce((sum, c) => sum + c.price.amountRub * (c.category === "ram" ? build.ramCount : c.category === "fans" ? fanPacksOf(build) : 1), 0);
}
