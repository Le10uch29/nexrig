import { ALL_COMPONENTS } from "@/components/PcComponents";
import type { BuildSelection } from "@/types/build";
import type { ComponentCategory, ComponentOf, HardwareComponent } from "@/types/hardware";

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
  return {
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
    fans: pick(repo, selection.fans, "fans"),
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

/** Total demo price; memory is priced per module × ramCount. */
export function totalPrice(build: ResolvedBuild): number {
  return selectedComponents(build).reduce((sum, c) => sum + c.price.amountRub * (c.category === "ram" ? build.ramCount : 1), 0);
}
