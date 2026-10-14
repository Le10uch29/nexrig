import { describe, expect, it } from "vitest";
import { ALL_COMPONENTS, CASE_FANS, PC_CASES } from "@/components/PcComponents";
import { DEFAULT_SELECTION } from "@/data/default-build";
import { computeFit } from "@/features/installation/fit";
import { resolveAnchors } from "@/features/installation/anchors";
import { caseGeometry, PSU_DIMENSIONS } from "@/features/installation/layout";
import { formatMoney, toRub } from "@/features/settings/currency";
import { resolveBuild } from "@/lib/hardware/repository";
import { collapseColorVariants, colorVariantsOf } from "@/lib/hardware/variants";

describe("colour editions", () => {
  it("links every colour SKU to an existing primary product", () => {
    const ids = new Set(ALL_COMPONENTS.map((c) => c.id));
    const grouped = ALL_COMPONENTS.filter((c) => c.variantGroup);
    expect(grouped.length).toBeGreaterThan(50);
    for (const c of grouped) {
      expect(ids.has(c.variantGroup!), c.id).toBe(true);
      expect(c.colorway, c.id).toBeDefined();
    }
  });

  it("offers white and black editions of a case and keeps the original id", () => {
    const north = PC_CASES.find((c) => c.id === "fractal-design-north")!;
    const variants = colorVariantsOf(north);
    expect(variants.map((v) => v.colorway)).toEqual(["black", "white"]);
    expect(variants[1].id).toBe("fractal-design-north-white");
    // A white edition is the same case: identical clearances.
    const white = variants[1] as typeof north;
    expect(white.maxGpuLengthMm).toBe(north.maxGpuLengthMm);
  });

  it("collapses colour editions into one entry, preferring the requested colour", () => {
    const list = PC_CASES.filter((c) => c.brand === "Lian Li");
    const collapsed = collapseColorVariants(list, (g) => (g === "lian-li-o11-dynamic-evo" ? "lian-li-o11-dynamic-evo-white" : undefined));
    expect(collapsed.filter((c) => c.variantGroup === "lian-li-o11-dynamic-evo").map((c) => c.id)).toEqual(["lian-li-o11-dynamic-evo-white"]);
    expect(new Set(collapsed.map((c) => c.variantGroup ?? c.id)).size).toBe(collapsed.length);
  });

  it("adds Lian Li and panoramic aquarium cases", () => {
    const aquarium = PC_CASES.filter((c) => c.layout === "dual-chamber" && !c.colorway?.startsWith("white"));
    expect(aquarium.length).toBeGreaterThanOrEqual(8);
    expect(PC_CASES.filter((c) => c.brand === "Lian Li" && c.colorway !== "white").length).toBeGreaterThanOrEqual(8);
    for (const c of PC_CASES) {
      const sum = Object.values(c.fanMounts).reduce((a, b) => a + (b ?? 0), 0);
      expect(sum, c.id).toBe(c.fanSlots120);
    }
  });
});

describe("display currency", () => {
  it("converts RUB with the fixed reference rate", () => {
    expect(formatMoney(8200, "USD")).toMatch(/100/);
    expect(formatMoney(8200, "USD")).toMatch(/\$/);
    expect(formatMoney(3000, "GEL")).toMatch(/100/);
    expect(toRub(100, "USD")).toBe(8200);
    expect(formatMoney(12345, "RUB")).toMatch(/12\s?345/);
  });
});

describe("aquarium (dual-chamber) cases", () => {
  const sel = { ...DEFAULT_SELECTION, case: "lian-li-o11-dynamic-evo" };

  it("puts intake fans at the bottom first, then the side", () => {
    const fit = computeFit(resolveBuild(sel))!;
    expect(fit.fans?.positions[0]).toBe("bottom");
    expect(fit.fans?.poses).toHaveLength(3);
  });

  it("keeps the PSU in the rear chamber, behind the motherboard tray", () => {
    const c = PC_CASES.find((x) => x.id === "lian-li-o11-dynamic-evo")!;
    const g = caseGeometry(c);
    const psu = resolveAnchors(c).psu_bay!;
    // Rotated on its side: height runs along +z from the anchor.
    expect(psu.position[2] + PSU_DIMENSIONS.ATX.height).toBeLessThan(g.trayZ - 0.03);
    expect(psu.position[2]).toBeGreaterThan(-g.width / 2);
    expect(g.shroudHeight).toBe(0);
  });

  it("uses reverse-blade fans for bottom intake in classic cases with bottom mounts", () => {
    const reverse = CASE_FANS.find((f) => f.reverse && f.count === 3 && !f.colorway?.startsWith("white"))!;
    const fit = computeFit(resolveBuild({ ...sel, fans: reverse.id }))!;
    expect(fit.fans?.positions[0]).toBe("bottom");
  });
});
