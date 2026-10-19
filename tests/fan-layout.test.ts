import { describe, expect, it } from "vitest";
import { CASE_FANS, GPU_NVIDIA, MOTHERBOARDS, PC_CASES } from "@/components/PcComponents";
import { BOARD_LAYOUTS, caseGeometry } from "@/features/installation/layout";
import { DEFAULT_SELECTION } from "@/data/default-build";
import { checkBuild } from "@/features/compatibility/engine";
import { computeFit } from "@/features/installation/fit";
import { estimatePeakPower } from "@/lib/hardware/power";
import { fanCountOf, fanPacksOf, normalizeFanLayout, resolveBuild, totalPrice } from "@/lib/hardware/repository";
import { selectionSchema } from "@/lib/validation/schemas";
import type { BuildSelection } from "@/types/build";
import type { CaseSpec } from "@/types/hardware";

const pack3 = CASE_FANS.find((f) => f.count === 3 && f.sizeMm === 120)!;

function selectionFor(c: CaseSpec, extra: Partial<BuildSelection> = {}): BuildSelection {
  const board = MOTHERBOARDS.find((m) => m.socket === "AM5" && m.formFactor === c.supportedBoards[0])!;
  return { ...DEFAULT_SELECTION, case: c.id, motherboard: board.id, psu: c.supportedPsu.includes("ATX") ? DEFAULT_SELECTION.psu : "corsair-sf750-platinum", fans: pack3.id, ...extra };
}

const classic = PC_CASES.find((c) => c.layout === "classic" && (c.fanMounts.rear ?? 0) >= 1 && (c.fanMounts.top ?? 0) >= 2 && c.supportedBoards.includes("ATX"))!;
const aquarium = PC_CASES.find((c) => c.layout === "dual-chamber" && (c.fanMounts.side ?? 0) >= 2 && c.supportedBoards.includes("ATX"))!;

describe("fan layout", () => {
  it("normalizes user input; an empty layout means automatic", () => {
    expect(normalizeFanLayout({ rear: 1, top: 2, side: 0, front: -1, bottom: 2.5, junk: 4 })).toEqual({ rear: 1, top: 2 });
    expect(normalizeFanLayout({ rear: 0 })).toBeUndefined();
    expect(normalizeFanLayout("x")).toBeUndefined();
    expect(normalizeFanLayout({ top: 9 })).toBeUndefined();
  });

  it("without a layout installs the whole pack, as before", () => {
    const b = resolveBuild(selectionFor(classic));
    expect(fanCountOf(b)).toBe(3);
    expect(fanPacksOf(b)).toBe(1);
    expect(computeFit(b)!.fans!.poses).toHaveLength(3);
  });

  it("places exactly the requested fans per position", () => {
    const b = resolveBuild(selectionFor(classic, { fanLayout: { rear: 1, top: 2 } }));
    const fit = computeFit(b)!.fans!;
    expect(fit.requested).toBe(3);
    expect(fit.placedBy).toEqual({ rear: 1, top: 2 });
    expect(fit.poses).toHaveLength(3);
    expect(fit.positions.sort()).toEqual(["rear", "top"]);
  });

  it("prices fans per pack and counts power per fan", () => {
    const one = resolveBuild(selectionFor(classic, { fanLayout: { rear: 1 } }));
    const five = resolveBuild(selectionFor(classic, { fanLayout: { front: 3, rear: 1, top: 1 } }));
    expect(fanPacksOf(one)).toBe(1);
    expect(fanPacksOf(five)).toBe(2);
    expect(totalPrice(five) - totalPrice(one)).toBe(pack3.price.amountRub);
    expect(estimatePeakPower(five)! - estimatePeakPower(one)!).toBe(4 * 3);
  });

  it("reports capacity per position within the case's mounts", () => {
    const fit = computeFit(resolveBuild(selectionFor(classic, { fanLayout: { rear: 1 } })))!.fans!;
    for (const [pos, n] of Object.entries(fit.capacity)) expect(n).toBeLessThanOrEqual(classic.fanMounts[pos as keyof typeof classic.fanMounts] ?? 0);
    expect(fit.capacity.rear).toBeGreaterThanOrEqual(1);
  });

  it("supports side fans next to the board in aquarium cases", () => {
    const fit = computeFit(resolveBuild(selectionFor(aquarium, { fanLayout: { side: 2 } })))!.fans!;
    expect(fit.capacity.side).toBeGreaterThanOrEqual(2);
    expect(fit.placedBy).toEqual({ side: 2 });
  });

  it("mounts side fans of a glass-front case right of the board, facing the side glass", () => {
    const b = resolveBuild(selectionFor(aquarium, { fanLayout: { side: 2 }, gpu: null }));
    const fit = computeFit(b)!.fans!;
    const g = caseGeometry(aquarium);
    const boardRight = g.boardOrigin[0] + BOARD_LAYOUTS.ATX.width;
    expect(fit.poses).toHaveLength(2);
    for (const p of fit.poses) {
      expect(p.rotation).toEqual([0, 0, 0]); // axis along z: seen face-on through the side glass
      expect(p.position[0] - 0.6).toBeGreaterThanOrEqual(boardRight); // right of the motherboard
      expect(p.position[0] + 0.6).toBeLessThanOrEqual(g.depth / 2 - g.wall); // not on the front glass
      expect(p.position[2]).toBeLessThan(g.trayZ + 0.3); // against the tray, not the glass
    }
    expect(fit.capacity.front).toBeUndefined();
  });

  it("skips side slots behind a long GPU but keeps the ones above and below", () => {
    const longGpu = GPU_NVIDIA.filter((x) => x.lengthMm <= aquarium.maxGpuLengthMm).sort((a, b2) => b2.lengthMm - a.lengthMm)[0];
    const free = computeFit(resolveBuild(selectionFor(aquarium, { fanLayout: { side: 3 }, gpu: null })))!.fans!;
    const withGpu = computeFit(resolveBuild(selectionFor(aquarium, { fanLayout: { side: 3 }, gpu: longGpu.id })))!.fans!;
    expect(withGpu.capacity.side!).toBeLessThan(free.capacity.side!);
    expect(withGpu.capacity.side!).toBeGreaterThan(0);
  });

  it("flags a layout that asks for more than fits", () => {
    const rear = classic.fanMounts.rear ?? 1;
    const b = resolveBuild(selectionFor(classic, { fanLayout: { rear: rear + 1 } }));
    const fit = computeFit(b)!.fans!;
    expect(fit.poses.length).toBe(rear);
    const check = checkBuild(selectionFor(classic, { fanLayout: { rear: rear + 1 } })).checks.find((c) => c.rule === "fans-fit");
    expect(check?.status).toBe("incompatible");
  });

  it("is accepted by the selection schema and optional for older builds", () => {
    expect(selectionSchema.parse({ ...DEFAULT_SELECTION, fanLayout: { rear: 2, side: 1 } }).fanLayout).toEqual({ rear: 2, side: 1 });
    const older: Omit<BuildSelection, "fanLayout"> = { ...DEFAULT_SELECTION };
    delete (older as BuildSelection).fanLayout;
    expect(selectionSchema.parse(older).fanLayout).toBeUndefined();
  });
});
