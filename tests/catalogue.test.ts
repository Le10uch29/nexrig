import { describe, expect, it } from "vitest";
import { ALL_COMPONENTS, CPU_AMD, CPU_INTEL, GPU_AMD, GPU_NVIDIA, HDD, MOTHERBOARDS, POWER_BLOCKS, RAM } from "@/components/PcComponents";
import { applyFacetPath, FACETS, facetOptions, pathFor } from "@/features/catalog/facets";
import { CATEGORY_ORDER } from "@/types/hardware";

describe("PcComponents catalogue", () => {
  it("has unique ids and every category populated", () => {
    const ids = ALL_COMPONENTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const cat of CATEGORY_ORDER) expect(ALL_COMPONENTS.some((c) => c.category === cat), cat).toBe(true);
  });

  it("gives every GPU a fan count and lights only RGB product lines", () => {
    const gpus = [...GPU_NVIDIA, ...GPU_AMD];
    for (const g of gpus) expect(g.fans, g.id).toBeGreaterThanOrEqual(1);
    // Blower reference designs.
    expect(GPU_AMD.find((g) => g.line === "Reference" && g.chip === "RX 5700 XT")?.fans).toBe(1);
    expect(GPU_NVIDIA.find((g) => g.line === "Founders Edition" && g.chip === "GTX 1080")?.fans).toBe(1);
    expect(GPU_AMD.find((g) => g.line === "Reference" && g.chip === "RX 7900 XTX")?.fans).toBe(3);
    // Reference cards and plain lines have no lighting; known RGB lines do.
    expect(gpus.filter((g) => g.line === "Reference" || g.line === "Founders Edition").every((g) => !g.rgb)).toBe(true);
    expect(gpus.filter((g) => g.line.startsWith("ROG Strix")).every((g) => g.rgb)).toBe(true);
    expect(gpus.filter((g) => g.line.startsWith("Ventus")).some((g) => g.rgb)).toBe(false);
  });

  it("covers GTX 1060 → RTX 5090 and RX 580 → RX 9070 XT", () => {
    const nv = new Set(GPU_NVIDIA.map((g) => g.chip));
    for (const chip of ["GTX 1060 6 ГБ", "GTX 1080 Ti", "GTX 1660 SUPER", "RTX 2080 Ti", "RTX 3060", "RTX 4070 SUPER", "RTX 5060 Ti 16 ГБ", "RTX 5090"]) expect(nv.has(chip), chip).toBe(true);
    const amd = new Set(GPU_AMD.map((g) => g.chip));
    for (const chip of ["RX 580", "RX Vega 64", "RX 5700 XT", "RX 6800 XT", "RX 7900 XTX", "RX 9070 XT"]) expect(amd.has(chip), chip).toBe(true);
  });

  it("marks template-generated partner cards as approximate, reference cards are not", () => {
    for (const g of [...GPU_NVIDIA, ...GPU_AMD]) {
      const reference = g.line === "Founders Edition" || g.line === "Reference";
      expect(g.dataQuality, g.id).toBe(reference ? "manufacturer-unverified" : "approximate");
      if (!reference) expect(g.variantNote).toBeTruthy();
    }
  });

  it("has GPUs without RT reporting rtIndex 0", () => {
    const gtx = GPU_NVIDIA.find((g) => g.chip === "GTX 1080")!;
    expect(gtx.rayTracing).toBe(false);
    expect(gtx.rtIndex).toBe(0);
  });

  it("spans DDR3 → DDR5 for memory and boards, and PSUs start at 500 W", () => {
    expect(new Set(RAM.map((r) => r.type))).toEqual(new Set(["DDR3", "DDR4", "DDR5"]));
    expect(new Set(MOTHERBOARDS.map((b) => b.memoryType))).toEqual(new Set(["DDR3", "DDR4", "DDR5"]));
    expect(new Set(MOTHERBOARDS.map((b) => b.brand))).toEqual(new Set(["ASUS", "MSI", "Gigabyte", "ASRock"]));
    expect(Math.min(...POWER_BLOCKS.map((p) => p.wattage))).toBeGreaterThanOrEqual(500);
    expect(HDD.every((h) => h.kind === "hdd" && h.formFactor === "3.5in")).toBe(true);
  });

  it("gives every CPU a series and a family matching board support lists", () => {
    const families = new Set([...CPU_INTEL, ...CPU_AMD].map((c) => c.family));
    for (const b of MOTHERBOARDS) for (const f of [...b.biosUpdateFamilies, ...b.unsupportedFamilies]) expect(families.has(f), `${b.id}: ${f}`).toBe(true);
    expect([...CPU_INTEL, ...CPU_AMD].every((c) => c.series)).toBe(true);
  });
});

describe("step-by-step facets", () => {
  it("narrows GPUs brand → line → series to the chips of that series", () => {
    const gpus = ALL_COMPONENTS.filter((c) => c.category === "gpu");
    const list = applyFacetPath("gpu", gpus, ["ASUS", "ROG Strix", "RTX 50"]);
    const chips = list.map((g) => (g.category === "gpu" ? g.chip : ""));
    expect(chips).toEqual(expect.arrayContaining(["RTX 5070", "RTX 5080", "RTX 5090"]));
    expect(list.every((g) => g.brand === "ASUS")).toBe(true);
  });

  it("orders motherboard memory generations newest first and offers chipsets for that generation", () => {
    const boards = ALL_COMPONENTS.filter((c) => c.category === "motherboard");
    const asus = applyFacetPath("motherboard", boards, ["ASUS"]);
    expect(facetOptions(FACETS.motherboard[1], asus, () => true).map((o) => o.value)).toEqual(["DDR5", "DDR4", "DDR3"]);
    const ddr3 = applyFacetPath("motherboard", boards, ["ASUS", "DDR3"]);
    expect(facetOptions(FACETS.motherboard[2], ddr3, () => true).map((o) => o.value)).toEqual(expect.arrayContaining(["Z77", "Z97", "AMD 970"]));
  });

  it("finds the facet path back to any component", () => {
    for (const c of ALL_COMPONENTS.slice(0, 200)) {
      expect(applyFacetPath(c.category, ALL_COMPONENTS.filter((x) => x.category === c.category), pathFor(c))).toContain(c);
    }
  });
});
