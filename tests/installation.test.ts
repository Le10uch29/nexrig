import { describe, expect, it } from "vitest";
import { DEFAULT_SELECTION } from "@/data/default-build";
import { checkBuild } from "@/features/compatibility/engine";
import { ramSlotsFor, resolveAnchors } from "@/features/installation/anchors";
import { installPath, MOTION_PROFILES, removalPath } from "@/features/installation/motion";
import { computePlacements } from "@/features/installation/placement";
import { hardwareRepository, resolveBuild } from "@/lib/hardware/repository";
import type { BuildSelection } from "@/types/build";
import type { CaseSpec, MotherboardSpec } from "@/types/hardware";

const placements = (sel: BuildSelection) => computePlacements(resolveBuild(sel), checkBuild(sel).checks);

describe("anchors", () => {
  const north = hardwareRepository.byId("fractal-design-north") as CaseSpec;
  const atx = hardwareRepository.byId("asus-tuf-gaming-b650-plus-wifi") as MotherboardSpec;
  const itx = hardwareRepository.byId("asus-rog-strix-b650e-i-gaming-wifi") as MotherboardSpec;

  it("exposes board anchors only when a board is present", () => {
    expect(resolveAnchors(north).gpu_slot).toBeUndefined();
    const a = resolveAnchors(north, atx);
    for (const name of ["motherboard_mount", "cpu_socket", "cpu_cooler_mount", "gpu_slot", "psu_bay", "ram_slot_4", "ssd_slot_1"] as const) {
      expect(a[name], name).toBeDefined();
    }
  });

  it("limits RAM anchors to the board's DIMM count", () => {
    const a = resolveAnchors(north, itx);
    expect(a.ram_slot_2).toBeDefined();
    expect(a.ram_slot_3).toBeUndefined();
  });

  it("populates A2/B2 for two modules on a four-slot board", () => {
    expect(ramSlotsFor(2, 4)).toEqual([2, 4]);
    expect(ramSlotsFor(2, 2)).toEqual([1, 2]);
    expect(ramSlotsFor(4, 4)).toEqual([1, 2, 3, 4]);
    expect(ramSlotsFor(1, 4)).toEqual([2]);
    expect(ramSlotsFor(3, 4)).toEqual([1, 2, 4]);
  });
});

describe("motion paths", () => {
  const anchor = { position: [1, 2, 3] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] };
  const bench = { position: [6, 0.5, 2] as [number, number, number], rotation: [0, -0.45, 0] as [number, number, number] };

  it("GPU install ends exactly on the slot anchor and pushes along the insertion axis", () => {
    const path = installPath(MOTION_PROFILES.gpu, bench, anchor);
    const last = path[path.length - 1];
    const align = path[path.length - 2];
    expect(last.position).toEqual(anchor.position);
    expect(last.rotation).toEqual(anchor.rotation);
    expect(align.rotation).toEqual(anchor.rotation);
    // Final push moves only along z (perpendicular to the board).
    expect(align.position[0]).toBeCloseTo(anchor.position[0]);
    expect(align.position[1]).toBeCloseTo(anchor.position[1]);
    expect(align.position[2]).toBeGreaterThan(anchor.position[2]);
  });

  it("removal from a mounted pose extracts first, then returns to the bench", () => {
    const path = removalPath(MOTION_PROFILES.gpu, anchor, bench, true);
    expect(path[0].label).toBe("extract");
    expect(path[path.length - 1].position).toEqual(bench.position);
  });
});

describe("placements", () => {
  it("mounts every part of the default build", () => {
    const ps = placements(DEFAULT_SELECTION);
    expect(ps.every((p) => p.state === "mounted")).toBe(true);
  });

  it("parks a wrong-socket CPU with a conflict reason, and its cooler waits", () => {
    const ps = placements({ ...DEFAULT_SELECTION, cpu: "intel-core-i7-14700k" });
    const cpu = ps.find((p) => p.key === "cpu")!;
    expect(cpu.state).toBe("parked");
    expect(cpu.reason).toBe("conflict");
    const cooler = ps.find((p) => p.key === "cooler")!;
    expect(cooler.reason).toBe("waiting");
  });

  it("places one RAM module per chosen count and mounts HDDs in 3.5″ bays", () => {
    for (const ramCount of [1, 2, 3, 4]) {
      const ram = placements({ ...DEFAULT_SELECTION, ramCount }).find((p) => p.key === "ram")!;
      expect(ram.state).toBe("mounted");
      expect(ram.children).toHaveLength(ramCount);
    }
    const hdd = placements({ ...DEFAULT_SELECTION, storage: ["wd-blue-2tb-hdd"] }).find((p) => p.key === "storage:wd-blue-2tb-hdd")!;
    expect(hdd.state).toBe("mounted");
  });

  it("mounts the GPU at the gpu_slot anchor", () => {
    const sel = { ...DEFAULT_SELECTION, gpu: "nvidia-founders-edition-rtx-5070" };
    const anchors = resolveAnchors(hardwareRepository.byId("fractal-design-north") as CaseSpec, hardwareRepository.byId("asus-tuf-gaming-b650-plus-wifi") as MotherboardSpec);
    const gpu = placements(sel).find((p) => p.key === "gpu")!;
    expect(gpu.state).toBe("mounted");
    expect(gpu.target.position).toEqual(anchors.gpu_slot!.position);
  });
});
