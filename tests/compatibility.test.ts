import { describe, expect, it } from "vitest";
import { DEFAULT_SELECTION } from "@/data/default-build";
import { checkBuild, evaluateCandidate, withComponent } from "@/features/compatibility/engine";
import { gpuLengthRule } from "@/features/compatibility/rules";
import { hardwareRepository, resolveBuild } from "@/lib/hardware/repository";
import { EMPTY_SELECTION, type BuildSelection } from "@/types/build";

const byRule = (sel: BuildSelection, rule: string) => checkBuild(sel).checks.filter((c) => c.rule === rule);
const comp = (id: string) => {
  const c = hardwareRepository.byId(id);
  if (!c) throw new Error(`missing ${id}`);
  return c;
};

const ITX = {
  ...DEFAULT_SELECTION,
  case: "cooler-master-masterbox-nr200p",
  motherboard: "asus-rog-strix-b650e-i-gaming-wifi",
  psu: "corsair-sf750-platinum",
};

describe("compatibility engine", () => {
  it("default build resolves fully and has no incompatibilities", () => {
    const r = resolveBuild(DEFAULT_SELECTION);
    expect([r.case, r.motherboard, r.cpu, r.cooler, r.ram, r.psu, r.fans].every(Boolean)).toBe(true);
    expect(r.storage).toHaveLength(1);
    expect(checkBuild(DEFAULT_SELECTION).counts.incompatible).toBe(0);
  });

  it("never reports a complete verdict for an empty or partial build", () => {
    expect(checkBuild(EMPTY_SELECTION).overall).toBe("unknown");
    const partial = checkBuild({ ...EMPTY_SELECTION, cpu: "amd-ryzen-7-7800x3d" });
    expect(partial.overall).not.toBe("compatible");
    expect(partial.checks.find((c) => c.rule === "socket")?.status).toBe("unknown");
  });

  it("rejects a CPU on the wrong socket", () => {
    expect(byRule({ ...DEFAULT_SELECTION, cpu: "intel-core-i7-14700k" }, "socket")[0].status).toBe("incompatible");
  });

  it("flags BIOS-dependent CPU families and rejects families the chipset does not support", () => {
    const sel = { ...DEFAULT_SELECTION, cpu: "amd-ryzen-7-9800x3d" };
    expect(byRule(sel, "bios")[0].status).toBe("warning");
    expect(byRule({ ...sel, motherboard: "msi-mag-x870-tomahawk-wifi" }, "bios")[0].status).toBe("compatible");
    const b550 = { ...DEFAULT_SELECTION, motherboard: "msi-mag-b550-tomahawk", cpu: "amd-ryzen-7-2700x", ram: "corsair-vengeance-lpx-ddr4-16gb-3200-cl16" };
    expect(byRule(b550, "chipset-support")[0].status).toBe("incompatible");
  });

  it("rejects DDR4 memory on a DDR5 board", () => {
    expect(byRule({ ...DEFAULT_SELECTION, ram: "corsair-vengeance-lpx-ddr4-16gb-3200-cl16" }, "memory-type")[0].status).toBe("incompatible");
  });

  it("checks the chosen module count against DIMM slots", () => {
    expect(byRule({ ...ITX, ramCount: 4 }, "memory-slots")[0].status).toBe("incompatible");
    expect(byRule({ ...ITX, ramCount: 2 }, "memory-slots")[0].status).toBe("compatible");
    expect(byRule({ ...DEFAULT_SELECTION, ramCount: 4 }, "memory-slots")[0].status).toBe("compatible");
  });

  it("warns about single-channel and asymmetric module counts", () => {
    expect(byRule({ ...DEFAULT_SELECTION, ramCount: 1 }, "memory-population")[0].status).toBe("warning");
    expect(byRule({ ...DEFAULT_SELECTION, ramCount: 3 }, "memory-population")[0].status).toBe("warning");
    expect(byRule({ ...DEFAULT_SELECTION, ramCount: 2 }, "memory-population")).toHaveLength(0);
  });

  it("checks GPU length against case clearance", () => {
    const build = resolveBuild({ ...DEFAULT_SELECTION, gpu: "sapphire-nitroplus-rx-9070-xt" });
    const status = (maxGpuLengthMm: number) => {
      const out = gpuLengthRule({ ...build, case: { ...build.case!, maxGpuLengthMm } });
      return (Array.isArray(out) ? out[0] : out)!.status;
    };
    const len = build.gpu!.lengthMm;
    expect(status(len + 40)).toBe("compatible");
    expect(status(len + 5)).toBe("warning");
    expect(status(len - 20)).toBe("incompatible");
  });

  it("rejects an ATX board in an ITX-only case", () => {
    expect(byRule({ ...DEFAULT_SELECTION, case: "cooler-master-masterbox-nr200p" }, "form-factor")[0].status).toBe("incompatible");
  });

  it("flags a 360 mm radiator in a case that can't take it", () => {
    expect(byRule({ ...DEFAULT_SELECTION, case: "nzxt-h5-flow", cooler: "arctic-liquid-freezer-iii-360" }, "radiator")[0].status).toBe("incompatible");
  });

  it("rejects a cooler without a mount for the socket", () => {
    const sel = { ...DEFAULT_SELECTION, motherboard: "msi-mag-z890-tomahawk-wifi", cpu: "intel-core-ultra-7-265k", cooler: "deepcool-ak400" };
    expect(byRule(sel, "cooler-socket")[0].status).toBe("incompatible");
  });

  it("handles 12V-2x6, adapters, 6/8-pin and slot-powered cards", () => {
    const native = { ...DEFAULT_SELECTION, gpu: "nvidia-founders-edition-rtx-5070" };
    expect(byRule(native, "psu-connectors")[0].status).toBe("compatible");
    expect(byRule({ ...native, psu: "cooler-master-mwe-gold-650-v2" }, "psu-connectors")[0].status).toBe("warning");
    expect(byRule({ ...DEFAULT_SELECTION, gpu: "asus-dual-gtx-1650" }, "psu-connectors")[0].status).toBe("compatible");
    // GTX 1080 Ti: 8-pin + 6-pin → two 6+2-pin cables.
    expect(byRule({ ...DEFAULT_SELECTION, gpu: "nvidia-founders-edition-gtx-1080-ti" }, "psu-connectors")[0].detail).toContain("2×8-pin");
  });

  it("rejects a PSU below the estimated peak and flags thin headroom", () => {
    expect(byRule({ ...DEFAULT_SELECTION, gpu: "nvidia-founders-edition-rtx-5090", psu: "cooler-master-mwe-gold-650-v2" }, "psu-capacity")[0].status).toBe("incompatible");
    expect(byRule({ ...DEFAULT_SELECTION, gpu: "nvidia-founders-edition-rtx-5080" }, "psu-capacity")[0].status).toBe("warning");
  });

  it("flags missing display output with no iGPU and no GPU", () => {
    const sel = { ...DEFAULT_SELECTION, motherboard: "asus-rog-strix-b550-f-gaming-wifi-ii", cpu: "amd-ryzen-5-5600x", ram: "corsair-vengeance-lpx-ddr4-16gb-3200-cl16", gpu: null };
    expect(byRule(sel, "display")[0].status).toBe("incompatible");
  });

  it("requires 3.5″ bays for hard drives", () => {
    const two = { ...DEFAULT_SELECTION, case: "nzxt-h5-flow", storage: ["wd-blue-2tb-hdd", "seagate-barracuda-4tb-hdd"] };
    expect(byRule(two, "storage-sata")[0].status).toBe("incompatible");
    expect(byRule({ ...two, case: "fractal-design-north" }, "storage-sata")[0].status).toBe("compatible");
  });

  it("treats memory above the CPU's official speed as an overclock, and flags locked chipsets", () => {
    const oc = byRule(DEFAULT_SELECTION, "memory-speed")[0];
    expect(oc.status).toBe("warning");
    expect(oc.severity).toBe("minor");
    const locked = {
      ...DEFAULT_SELECTION,
      motherboard: "asus-tuf-gaming-b460m-plus",
      cpu: "intel-core-i5-10400f",
      ram: "corsair-vengeance-lpx-ddr4-16gb-3200-cl16",
      cooler: "deepcool-ak400",
    };
    const l = byRule(locked, "memory-speed")[0];
    expect(l.status).toBe("warning");
    expect(l.severity).toBe("major");
  });

  it("rejects a GPU thicker than the case's expansion slots", () => {
    const sel = { ...ITX, gpu: "asus-rog-strix-rtx-4090" };
    expect(byRule(sel, "gpu-slots")[0].status).toBe("incompatible");
    expect(byRule({ ...sel, gpu: "asus-dual-rtx-4060" }, "gpu-slots")[0].status).toBe("compatible");
  });

  it("detects a front-only radiator conflicting with a long GPU", () => {
    // Fractal North takes 360 mm only at the front; a 304 mm card leaves no room for the radiator stack.
    const sel = { ...DEFAULT_SELECTION, cooler: "arctic-liquid-freezer-iii-360", gpu: "nvidia-founders-edition-rtx-5090" };
    const fit = byRule(sel, "radiator-fit")[0];
    expect(fit.status).toBe("incompatible");
    expect(fit.detail).toContain("не помещается");
    expect(byRule({ ...sel, gpu: "asus-dual-rtx-4060" }, "radiator-fit")[0].status).toBe("compatible");
    // O11 Dynamic EVO mounts 360 mm on top — no conflict with the GPU.
    const o11 = byRule({ ...sel, case: "lian-li-o11-dynamic-evo" }, "radiator-fit")[0];
    expect(o11.status).toBe("compatible");
    expect(o11.detail).toContain("сверху");
  });

  it("reports unknown dimensions instead of confirming fit", () => {
    const build = resolveBuild({ ...DEFAULT_SELECTION, gpu: "asus-dual-rtx-4060" });
    const out = gpuLengthRule({ ...build, gpu: { ...build.gpu!, lengthMm: undefined as unknown as number } });
    const c = (Array.isArray(out) ? out[0] : out)!;
    expect(c.status).toBe("unknown");
    expect(c.unknownReason).toBe("missing-data");
  });

  it("does not call a cooler sufficient without a published rating", () => {
    expect(byRule(DEFAULT_SELECTION, "cooler-capacity")[0].status).toBe("unknown");
    expect(evaluateCandidate(DEFAULT_SELECTION, comp("thermalright-peerless-assassin-120-se")).status).not.toBe("compatible");
  });

  it("gives every check a reason, a severity and the components it examined", () => {
    for (const c of checkBuild({ ...DEFAULT_SELECTION, gpu: "nvidia-founders-edition-rtx-5070" }).checks) {
      expect(c.why.length, c.rule).toBeGreaterThan(10);
      expect(c.severity).toBeTruthy();
      if (c.categories.length) expect(c.components.length, c.rule).toBeGreaterThan(0);
    }
  });

  it("passes a correct configuration with no known conflicts", () => {
    const clean = {
      ...DEFAULT_SELECTION,
      motherboard: "msi-mag-x870-tomahawk-wifi",
      cpu: "amd-ryzen-7-9800x3d",
      ram: "kingston-fury-beast-ddr5-16gb-5600-cl40",
      cooler: "deepcool-ak620",
      gpu: "nvidia-founders-edition-rtx-5070",
    };
    const r = checkBuild(clean);
    expect(r.counts).toMatchObject({ incompatible: 0, warning: 0, unknown: 0 });
    expect(r.overall).toBe("compatible");
  });

  it("evaluates a candidate only on checks touching its category", () => {
    const v = evaluateCandidate(DEFAULT_SELECTION, comp("intel-core-i9-14900k"));
    expect(v.status).toBe("incompatible");
    expect(v.checks.every((c) => c.categories.includes("cpu"))).toBe(true);
  });

  it("appends storage rather than replacing it", () => {
    const sel = withComponent(DEFAULT_SELECTION, comp("wd-wd-black-sn850x-1000gb"));
    expect(sel.storage).toEqual(["samsung-990-pro-2000gb", "wd-wd-black-sn850x-1000gb"]);
  });
});
