import { describe, expect, it } from "vitest";
import { CASE_FANS, CPU_COOLERS, GPU_NVIDIA, MOTHERBOARDS, PC_CASES, RAM } from "@/components/PcComponents";
import { DEFAULT_SELECTION } from "@/data/default-build";
import { checkBuild } from "@/features/compatibility/engine";
import { fansRule } from "@/features/compatibility/rules";
import { computeFit, radiatorFanSize, RADIATOR_PREFERENCE } from "@/features/installation/fit";
import { caseGeometry, MM, SLOT_PITCH, type Vec3 } from "@/features/installation/layout";
import { computePlacements } from "@/features/installation/placement";
import { resolveBuild } from "@/lib/hardware/repository";
import type { BuildSelection } from "@/types/build";
import type { CaseSpec } from "@/types/hardware";

type Box = { min: Vec3; max: Vec3 };
const EPS = 1e-6;

/** Inside of the case shell (panels are 0.06 thick, glass inner face at width/2 - 0.02). */
function interior(c: CaseSpec): Box {
  const g = caseGeometry(c);
  return { min: [-g.depth / 2 + g.wall, g.wall, -g.width / 2 + g.wall], max: [g.depth / 2 - g.wall, g.height - g.wall, g.width / 2 - 0.02] };
}

function inside(b: Box, outer: Box) {
  return [0, 1, 2].every((i) => b.min[i] >= outer.min[i] - EPS && b.max[i] <= outer.max[i] + EPS);
}

/** Axis-aligned box of a local box rotated about z by `rz` and moved to `at`. */
function rotatedZ(local: Box, rz: number, at: Vec3): Box {
  const c = Math.round(Math.cos(rz));
  const s = Math.round(Math.sin(rz));
  const xs: number[] = [];
  const ys: number[] = [];
  for (const x of [local.min[0], local.max[0]])
    for (const y of [local.min[1], local.max[1]]) {
      xs.push(x * c - y * s);
      ys.push(x * s + y * c);
    }
  return {
    min: [at[0] + Math.min(...xs), at[1] + Math.min(...ys), at[2] + local.min[2]],
    max: [at[0] + Math.max(...xs), at[1] + Math.max(...ys), at[2] + local.max[2]],
  };
}

/** Radiator model extents: core/tanks ±0.14 in x, fans on -x (to -0.395), length ±len/2, width ±w/2. */
function radiatorBox(sizeMm: number): Box {
  const len = sizeMm * MM + 0.32;
  const w = (radiatorFanSize(sizeMm) * MM + 0.04) / 2;
  return { min: [-0.395, -len / 2, -w], max: [0.14, len / 2, w] };
}

function fanBox(at: Vec3, rotation: Vec3, size: number): Box {
  const half: Vec3 = rotation[1] !== 0 ? [0.135, size / 2, size / 2] : rotation[0] !== 0 ? [size / 2, 0.135, size / 2] : [size / 2, size / 2, 0.135];
  return { min: [at[0] - half[0], at[1] - half[1], at[2] - half[2]], max: [at[0] + half[0], at[1] + half[1], at[2] + half[2]] };
}

function selectionFor(c: CaseSpec): BuildSelection {
  const board = MOTHERBOARDS.find((m) => m.socket === "AM5" && m.formFactor === c.supportedBoards[0])!;
  return { ...DEFAULT_SELECTION, case: c.id, motherboard: board.id, psu: c.supportedPsu.includes("ATX") ? DEFAULT_SELECTION.psu : "corsair-sf750-platinum" };
}

const AIOS = [240, 280, 360, 420].map((r) => CPU_COOLERS.find((c) => c.kind === "aio" && c.radiatorMm === r)).filter((c) => c !== undefined);
const SHORT_GPU = GPU_NVIDIA.find((g) => g.id === "asus-dual-rtx-4060")!;
const LONG_GPU = [...GPU_NVIDIA].sort((a, b) => b.lengthMm - a.lengthMm)[0];
const TALL_RAM = [...RAM].filter((r) => r.type === "DDR5").sort((a, b) => b.heightMm - a.heightMm)[0];

describe("physical fit inside the case", () => {
  it("prefers the top panel for radiators and computes their real length", () => {
    const fit = computeFit(resolveBuild({ ...DEFAULT_SELECTION, case: "lian-li-lancool-iii", cooler: "arctic-liquid-freezer-iii-360" }))!;
    expect(fit.radiator?.chosen?.position).toBe("top");
    expect(fit.radiator?.lengthMm).toBe(392);
    expect(fit.radiator?.options.map((o) => o.position)).toEqual(RADIATOR_PREFERENCE.filter((p) => p === "top" || p === "front"));
  });

  it("uses 140 mm fans on 280/420 radiators", () => {
    expect(radiatorFanSize(280)).toBe(140);
    expect(radiatorFanSize(420)).toBe(140);
    expect(radiatorFanSize(360)).toBe(120);
  });

  it("never places a radiator, a GPU or case fans outside the case", () => {
    const failures: string[] = [];
    for (const c of PC_CASES) {
      const box = interior(c);
      for (const aio of AIOS) {
        for (const gpu of [SHORT_GPU, LONG_GPU]) {
          for (const ram of [undefined, TALL_RAM]) {
            const sel: BuildSelection = { ...selectionFor(c), cooler: aio.id, gpu: gpu.id, ...(ram ? { ram: ram.id } : {}) };
            const b = resolveBuild(sel);
            const fit = computeFit(b)!;
            const tag = `${c.id} + ${aio.id} + ${gpu.id}${ram ? " + tall RAM" : ""}`;
            const rad = fit.radiator?.chosen;
            // Main chamber only: in front of the motherboard tray, inside the shell.
            const main: Box = { min: [box.min[0], box.min[1], Math.max(box.min[2], caseGeometry(c).trayZ)], max: box.max };
            if (rad && !inside(rotatedZ(radiatorBox(aio.radiatorMm!), rad.pose.rotation[2], rad.pose.position), main)) failures.push(`radiator ${rad.position}: ${tag}`);
            for (const p of fit.fans?.poses ?? []) {
              if (!inside(fanBox(p.position, p.rotation, (b.fans?.sizeMm ?? 120) * MM), main)) failures.push(`fan: ${tag}`);
            }
            // A mounted GPU ends before the front panel and stays above the shroud.
            const placements = computePlacements(b, checkBuild(sel).checks);
            const g = placements.find((p) => p.key === "gpu");
            if (g?.state === "mounted") {
              const end = g.target.position[0] + gpu.lengthMm * MM;
              const bottom = g.target.position[1] - gpu.slots * SLOT_PITCH;
              const geo = caseGeometry(c);
              if (end > box.max[0] + EPS || bottom < Math.max(geo.wall, geo.shroudHeight + geo.wall / 2) - EPS) failures.push(`gpu: ${tag}`);
            }
            // The radiator's front stack never overlaps a mounted GPU.
            if (g?.state === "mounted" && rad && (rad.position === "front" || rad.position === "side")) {
              const gpuEnd = g.target.position[0] + gpu.lengthMm * MM;
              if (gpuEnd > rad.pose.position[0] - 0.395) failures.push(`radiator overlaps gpu: ${tag}`);
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("parks a radiator that fits nowhere and explains why", () => {
    // North: 360 only at the front, and a 304 mm card leaves no room for the radiator stack.
    const sel = { ...DEFAULT_SELECTION, cooler: "arctic-liquid-freezer-iii-360", gpu: "nvidia-founders-edition-rtx-5090" };
    const b = resolveBuild(sel);
    const check = checkBuild(sel).checks.find((c) => c.rule === "radiator-fit")!;
    expect(check.status).toBe("incompatible");
    expect(check.detail).toMatch(/спереди мешает видеокарта 304 мм/);
    expect(computePlacements(b, checkBuild(sel).checks).find((p) => p.key === "cooler")?.state).toBe("parked");
  });

  it("moves case fans off the front when a long GPU leaves no room, and warns", () => {
    // Pop Air allows 405 mm cards; a 400 mm card leaves no room for 25 mm front fans.
    const pop = PC_CASES.find((c) => c.id === "fractal-design-pop-air")!;
    const sel = { ...selectionFor(pop), gpu: LONG_GPU.id, fans: CASE_FANS.find((f) => f.count === 3)!.id };
    const base = resolveBuild(sel);
    const b = { ...base, gpu: { ...base.gpu!, lengthMm: 400 } };
    const fit = computeFit(b)!;
    expect(fit.fans?.frontBlockedByGpu).toBe(true);
    expect(fit.fans?.poses).toHaveLength(3);
    // Rear exhaust (axis x, at the back) or top (axis y) — never the front column.
    expect(fit.fans?.poses.every((p) => p.rotation[0] !== 0 || p.position[0] < 0)).toBe(true);
    const out = fansRule(b);
    expect((Array.isArray(out) ? out : [out]).find((c) => c?.rule === "fans-fit")?.status).toBe("warning");
    // A card that leaves room keeps the fans at the front.
    expect(computeFit(resolveBuild({ ...sel, gpu: SHORT_GPU.id }))!.fans?.positions).toEqual(["front"]);
  });

  it("caps the GPU limit by the case depth", () => {
    const c = PC_CASES.find((x) => x.id === "jonsbo-d31-mesh")!;
    const fit = computeFit(resolveBuild(selectionFor(c)))!;
    expect(fit.gpu).toBeUndefined();
    const withGpu = computeFit(resolveBuild({ ...selectionFor(c), gpu: LONG_GPU.id }))!;
    expect(withGpu.gpu!.interiorMm).toBeLessThan(c.exteriorMm.depth);
  });
});
