import { computeFit, RADIATOR_PREFERENCE, type RadiatorOption } from "@/features/installation/fit";
import { analyzeBalance } from "./balance";
import { adapterPinsFor, estimatePeakPower, recommendedPsuWattage } from "@/lib/hardware/power";
import { fanCountOf, type ResolvedBuild } from "@/lib/hardware/repository";
import { getMessages } from "@/lib/i18n";
import type { CheckSeverity, CheckStatus, CompatibilityCheck } from "@/types/compatibility";
import type { ComponentCategory, FanPosition } from "@/types/hardware";
import { compatMessages as m } from "./messages.ru";

/**
 * Each rule inspects a resolved build and returns zero or more checks.
 * Rules never guess: a missing part or spec yields "unknown"; a condition we cannot see
 * (BIOS version, adapters, memory overclock) yields "warning". "unknown" is never "compatible".
 */
export type Rule = (b: ResolvedBuild) => CompatibilityCheck | CompatibilityCheck[] | null;

type Group = keyof typeof m;

interface Draft {
  id?: string;
  rule: string;
  status: CheckStatus;
  detail: string;
  categories: ComponentCategory[];
  resolution?: string;
  severity?: CheckSeverity;
  title?: string;
  unknownReason?: CompatibilityCheck["unknownReason"];
}

const DEFAULT_SEVERITY: Record<CheckStatus, CheckSeverity> = {
  incompatible: "critical",
  warning: "major",
  unknown: "info",
  compatible: "info",
};

/** Builds a check with title/why from the message group and consistent defaults. */
function check(group: Group, d: Draft): CompatibilityCheck {
  const g = m[group] as { title: string; why: string };
  return {
    id: d.id ?? d.rule,
    rule: d.rule,
    title: d.title ?? g.title,
    why: g.why,
    status: d.status,
    severity: d.severity ?? DEFAULT_SEVERITY[d.status],
    detail: d.detail,
    resolution: d.status === "compatible" ? undefined : d.resolution,
    categories: d.categories,
    components: [],
    unknownReason: d.status === "unknown" ? (d.unknownReason ?? "missing-part") : undefined,
  };
}

const join = (xs: readonly (string | number)[]) => xs.join(", ");
const known = (n: number | undefined | null): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const POSITION_LABEL = { front: "спереди", top: "сверху", side: "сбоку", bottom: "снизу" } as const;

export const completenessRule: Rule = (b) => {
  const labels = getMessages().categories;
  const missing: string[] = [];
  if (!b.case) missing.push(labels.case);
  if (!b.motherboard) missing.push(labels.motherboard);
  if (!b.cpu) missing.push(labels.cpu);
  if (!b.cooler) missing.push(labels.cooler);
  if (!b.ram) missing.push(labels.ram);
  if (b.storage.length === 0) missing.push(labels.storage);
  if (!b.psu) missing.push(labels.psu);
  return check("completeness", {
    rule: "completeness",
    status: missing.length ? "unknown" : "compatible",
    detail: missing.length ? m.completeness.missing(missing.join(", ").toLowerCase()) : m.completeness.ok,
    resolution: m.completeness.resolution,
    categories: [],
  });
};

export const socketRule: Rule = ({ cpu, motherboard }) => {
  if (!cpu && !motherboard) return null;
  const categories: ComponentCategory[] = ["cpu", "motherboard"];
  if (!cpu || !motherboard) return check("socket", { rule: "socket", status: "unknown", detail: m.socket.missing, categories });
  const ok = cpu.socket === motherboard.socket;
  return check("socket", {
    rule: "socket",
    status: ok ? "compatible" : "incompatible",
    detail: ok ? m.socket.ok(cpu.socket) : m.socket.bad(cpu.socket, motherboard.socket),
    resolution: m.socket.resolution(cpu.socket),
    categories,
  });
};

export const biosRule: Rule = ({ cpu, motherboard }) => {
  if (!cpu || !motherboard || cpu.socket !== motherboard.socket) return null;
  const categories: ComponentCategory[] = ["cpu", "motherboard"];
  if (motherboard.unsupportedFamilies.includes(cpu.family)) {
    return check("bios", {
      id: "bios",
      rule: "chipset-support",
      status: "incompatible",
      detail: m.bios.unsupported(cpu.family, motherboard.chipset),
      resolution: m.bios.unsupportedResolution,
      categories,
    });
  }
  const needsUpdate = motherboard.biosUpdateFamilies.includes(cpu.family);
  return check("bios", {
    rule: "bios",
    status: needsUpdate ? "warning" : "compatible",
    detail: needsUpdate ? m.bios.verify(cpu.name, motherboard.name) : m.bios.ok(cpu.family, motherboard.chipset),
    resolution: m.bios.resolution,
    categories,
  });
};

export const memoryTypeRule: Rule = ({ ram, motherboard }) => {
  if (!ram && !motherboard) return null;
  const categories: ComponentCategory[] = ["ram", "motherboard"];
  if (!ram || !motherboard) return check("memoryType", { rule: "memory-type", status: "unknown", detail: m.memoryType.missing, categories });
  const ok = ram.type === motherboard.memoryType;
  return check("memoryType", {
    rule: "memory-type",
    status: ok ? "compatible" : "incompatible",
    detail: ok ? m.memoryType.ok(ram.type) : m.memoryType.bad(ram.type, motherboard.memoryType),
    resolution: m.memoryType.resolution(motherboard.memoryType),
    categories,
  });
};

export const cpuMemoryRule: Rule = ({ ram, cpu }) => {
  if (!ram || !cpu) return null;
  const ok = cpu.memorySupport.includes(ram.type);
  return check("cpuMemory", {
    rule: "cpu-memory",
    status: ok ? "compatible" : "incompatible",
    detail: ok ? m.cpuMemory.ok(ram.type) : m.cpuMemory.bad(ram.type, join(cpu.memorySupport)),
    resolution: m.cpuMemory.resolution,
    categories: ["ram", "cpu"],
  });
};

/** XMP/EXPO speeds are an overclock: never presented as guaranteed. */
export const memorySpeedRule: Rule = ({ ram, cpu, motherboard }) => {
  if (!ram || !cpu || !cpu.memorySupport.includes(ram.type)) return null;
  const categories: ComponentCategory[] = ["ram", "cpu", "motherboard"];
  const jedec = cpu.memorySpeedMtps?.[ram.type];
  if (!known(jedec)) return check("memorySpeed", { rule: "memory-speed", status: "unknown", unknownReason: "missing-data", detail: m.memorySpeed.unknown, categories });
  if (ram.speedMtps <= jedec) return check("memorySpeed", { rule: "memory-speed", status: "compatible", detail: m.memorySpeed.ok(ram.speedMtps, jedec), categories });
  if (motherboard && !motherboard.memoryOverclock) {
    return check("memorySpeed", {
      rule: "memory-speed",
      status: "warning",
      severity: "major",
      detail: m.memorySpeed.locked(ram.speedMtps, jedec, motherboard.chipset),
      resolution: m.memorySpeed.lockedResolution,
      categories,
    });
  }
  return check("memorySpeed", {
    rule: "memory-speed",
    status: "warning",
    severity: "minor",
    detail: m.memorySpeed.oc(ram.speedMtps, jedec),
    resolution: m.memorySpeed.resolution,
    categories,
  });
};

export const memorySlotsRule: Rule = ({ ram, ramCount, motherboard }) => {
  if (!ram || !motherboard || ram.type !== motherboard.memoryType) return null;
  const categories: ComponentCategory[] = ["ram", "motherboard"];
  const modules = ramCount;
  const totalGb = modules * ram.moduleSizeGb;
  if (modules > motherboard.memorySlots) {
    return check("memorySlots", { rule: "memory-slots", status: "incompatible", detail: m.memorySlots.tooMany(modules, motherboard.memorySlots), resolution: m.memorySlots.resolution, categories });
  }
  if (totalGb > motherboard.maxMemoryGb) {
    return check("memorySlots", { rule: "memory-slots", status: "incompatible", detail: m.memorySlots.tooMuch(totalGb, motherboard.maxMemoryGb), resolution: m.memorySlots.resolution, categories });
  }
  const checks = [
    check("memorySlots", { rule: "memory-slots", status: "compatible", detail: m.memorySlots.ok(modules, motherboard.memorySlots, totalGb, motherboard.maxMemoryGb), categories }),
  ];
  // Channel layout: one module runs single-channel, three are asymmetric, four DDR5 lower clocks.
  const population =
    modules === 1
      ? { title: m.memoryPopulation.singleTitle, detail: m.memoryPopulation.single, resolution: m.memoryPopulation.singleResolution, severity: "major" as const }
      : modules === 3
        ? { title: m.memoryPopulation.oddTitle, detail: m.memoryPopulation.odd, resolution: m.memoryPopulation.oddResolution, severity: "minor" as const }
        : ram.type === "DDR5" && modules >= 4
          ? { title: m.memoryPopulation.title, detail: m.memoryPopulation.verify, resolution: m.memoryPopulation.resolution, severity: "minor" as const }
          : null;
  if (population) checks.push(check("memoryPopulation", { rule: "memory-population", status: "warning", categories: ["ram"], ...population }));
  return checks;
};

export const formFactorRule: Rule = ({ case: pcCase, motherboard }) => {
  if (!pcCase && !motherboard) return null;
  const categories: ComponentCategory[] = ["case", "motherboard"];
  if (!pcCase || !motherboard) return check("formFactor", { rule: "form-factor", status: "unknown", detail: m.formFactor.missing, categories });
  const ok = pcCase.supportedBoards.includes(motherboard.formFactor);
  return check("formFactor", {
    rule: "form-factor",
    status: ok ? "compatible" : "incompatible",
    detail: ok ? m.formFactor.ok(motherboard.formFactor) : m.formFactor.bad(motherboard.formFactor, join(pcCase.supportedBoards)),
    resolution: m.formFactor.resolution,
    categories,
  });
};

export const gpuLengthRule: Rule = (b) => {
  const { gpu, case: pcCase } = b;
  if (!gpu) return null;
  const categories: ComponentCategory[] = ["gpu", "case"];
  if (!pcCase) return check("gpuLength", { rule: "gpu-length", status: "unknown", detail: m.gpuLength.missing, categories });
  if (!known(gpu.lengthMm) || !known(pcCase.maxGpuLengthMm)) {
    return check("gpuLength", { rule: "gpu-length", status: "unknown", unknownReason: "missing-data", detail: m.gpuLength.unknown, categories });
  }
  // The manufacturer limit, unless the case's own depth leaves less room in practice.
  const interior = computeFit(b)?.gpu?.interiorMm ?? Infinity;
  const max = Math.min(pcCase.maxGpuLengthMm, interior);
  const margin = max - gpu.lengthMm;
  const status: CheckStatus = margin < 0 ? "incompatible" : margin < 10 ? "warning" : "compatible";
  return check("gpuLength", {
    rule: "gpu-length",
    status,
    detail:
      status === "incompatible"
        ? interior < pcCase.maxGpuLengthMm
          ? m.gpuLength.badInterior(gpu.lengthMm, interior, pcCase.exteriorMm.depth)
          : m.gpuLength.bad(gpu.lengthMm, pcCase.maxGpuLengthMm)
        : status === "warning"
          ? m.gpuLength.tight(gpu.lengthMm, max)
          : m.gpuLength.ok(gpu.lengthMm, max),
    resolution: m.gpuLength.resolution,
    categories,
  });
};

export const gpuSlotsRule: Rule = ({ gpu, case: pcCase }) => {
  if (!gpu || !pcCase) return null;
  const categories: ComponentCategory[] = ["gpu", "case"];
  if (!known(gpu.slots) || !known(pcCase.expansionSlots)) {
    return check("gpuSlots", { rule: "gpu-slots", status: "unknown", unknownReason: "missing-data", detail: m.gpuSlots.unknown, categories });
  }
  const need = Math.ceil(gpu.slots);
  const ok = need <= pcCase.expansionSlots;
  return check("gpuSlots", {
    rule: "gpu-slots",
    status: ok ? "compatible" : "incompatible",
    detail: ok ? m.gpuSlots.ok(need, pcCase.expansionSlots) : m.gpuSlots.bad(need, pcCase.expansionSlots),
    resolution: m.gpuSlots.resolution,
    categories,
  });
};

export const pcieRule: Rule = ({ gpu, motherboard }) => {
  if (!gpu || !motherboard) return null;
  // An x8/x4 card in an older-generation slot loses noticeable bandwidth.
  const narrowInOldSlot = gpu.pcieGen > motherboard.pcieX16Gen && gpu.pcieLanes <= 8;
  return check("pcie", {
    rule: "pcie",
    status: narrowInOldSlot ? "warning" : "compatible",
    severity: narrowInOldSlot ? "minor" : undefined,
    detail: m.pcie.ok(gpu.pcieGen, motherboard.pcieX16Gen, gpu.pcieLanes),
    categories: ["gpu", "motherboard"],
  });
};

export const displayOutputRule: Rule = ({ gpu, cpu }) => {
  if (gpu || !cpu) return null;
  return check("display", {
    rule: "display",
    status: cpu.integratedGraphics ? "compatible" : "incompatible",
    detail: cpu.integratedGraphics ? m.display.igpu : m.display.none,
    resolution: m.display.resolution,
    categories: ["gpu", "cpu"],
  });
};

export const coolerSocketRule: Rule = ({ cooler, cpu }) => {
  if (!cooler) return null;
  const categories: ComponentCategory[] = ["cooler", "cpu"];
  if (!cpu) return check("coolerSocket", { rule: "cooler-socket", status: "unknown", detail: m.coolerSocket.missing, categories });
  const ok = cooler.sockets.includes(cpu.socket);
  return check("coolerSocket", {
    rule: "cooler-socket",
    status: ok ? "compatible" : "incompatible",
    detail: ok ? m.coolerSocket.ok(cpu.socket) : m.coolerSocket.bad(cpu.socket, join(cooler.sockets)),
    resolution: m.coolerSocket.resolution,
    categories,
  });
};

function radiatorReason(o: RadiatorOption, gpuLen: number) {
  const pos = POSITION_LABEL[o.position];
  switch (o.block) {
    case "gpu":
      return m.radiatorFit.gpu(pos, gpuLen, o.availableMm);
    case "clearance":
      return m.radiatorFit.clearance(pos);
    case "drives":
      return m.radiatorFit.drives(pos);
    case "gpu-height":
      return m.radiatorFit.gpuHeight(pos, o.availableMm);
    case "board":
      return m.radiatorFit.board(pos, o.neededMm, o.availableMm);
    default:
      return m.radiatorFit.length(pos, o.neededMm, o.availableMm);
  }
}

export const coolerClearanceRule: Rule = (b) => {
  const { cooler, case: pcCase, gpu } = b;
  if (!cooler) return null;
  if (!pcCase) return check("coolerHeight", { rule: "cooler-height", status: "unknown", detail: m.coolerHeight.missing, categories: ["cooler", "case"] });

  if (cooler.kind === "aio") {
    const categories: ComponentCategory[] = ["cooler", "case"];
    if (!known(cooler.radiatorMm)) return check("radiator", { rule: "radiator", status: "unknown", unknownReason: "missing-data", detail: m.radiator.unknown, categories });
    const r = cooler.radiatorMm;
    // Radiators go on top, or on the side mount when the top cannot take them (see RADIATOR_PREFERENCE).
    const fits = pcCase.radiatorMounts.filter((mt) => RADIATOR_PREFERENCE.includes(mt.position) && mt.sizesMm.includes(r));
    if (!fits.length) {
      const list = pcCase.radiatorMounts.filter((mt) => RADIATOR_PREFERENCE.includes(mt.position)).map((mt) => `${POSITION_LABEL[mt.position]} ${join(mt.sizesMm)} мм`).join("; ") || "нет";
      return check("radiator", { rule: "radiator", status: "incompatible", detail: m.radiator.bad(r, list), resolution: m.radiator.resolution, categories });
    }
    const checks = [check("radiator", { rule: "radiator", status: "compatible", detail: m.radiator.ok(r, fits.map((mt) => POSITION_LABEL[mt.position]).join(", ")), categories })];
    // Physical placement: the radiator's real length and the stack thickness against GPU, RAM and drives.
    const rad = computeFit(b)?.radiator;
    if (rad) {
      const fitCategories: ComponentCategory[] = ["cooler", "case", ...(gpu ? (["gpu"] as const) : []), ...(b.ram ? (["ram"] as const) : [])];
      const gpuLen = gpu?.lengthMm ?? 0;
      if (!rad.chosen) {
        checks.push(
          check("radiatorFit", {
            rule: "radiator-fit",
            status: "incompatible",
            detail:
              m.radiatorFit.none(r, rad.lengthMm, rad.options.map((o) => radiatorReason(o, gpuLen)).join("; ")) +
              (rad.options.some((o) => o.position === "top") ? "" : m.radiatorFit.topUnsupported),
            resolution: m.radiatorFit.resolution,
            categories: fitCategories,
          }),
        );
      } else {
        const top = rad.options.find((o) => o.position === "top");
        const note =
          rad.chosen.position === "top" ? "" : top ? m.radiatorFit.notTop(radiatorReason(top, gpuLen).replace(/^сверху /, "")) : m.radiatorFit.topUnsupported;
        checks.push(
          check("radiatorFit", {
            rule: "radiator-fit",
            status: "compatible",
            detail: m.radiatorFit.placed(r, rad.lengthMm, POSITION_LABEL[rad.chosen.position], rad.chosen.availableMm) + note,
            categories: fitCategories,
          }),
        );
      }
    }
    return checks;
  }

  const categories: ComponentCategory[] = ["cooler", "case"];
  if (!known(cooler.heightMm) || !known(pcCase.maxCpuCoolerHeightMm)) {
    return check("coolerHeight", { rule: "cooler-height", status: "unknown", unknownReason: "missing-data", detail: m.coolerHeight.unknown, categories });
  }
  // Manufacturer limit, capped by the distance from the CPU to the side panel.
  const maxH = Math.min(pcCase.maxCpuCoolerHeightMm, computeFit(b)?.coolerHeightMm ?? Infinity);
  const margin = maxH - cooler.heightMm;
  const status: CheckStatus = margin < 0 ? "incompatible" : margin < 5 ? "warning" : "compatible";
  return check("coolerHeight", {
    rule: "cooler-height",
    status,
    detail:
      status === "incompatible"
        ? m.coolerHeight.bad(cooler.heightMm, maxH)
        : status === "warning"
          ? m.coolerHeight.tight(cooler.heightMm, maxH)
          : m.coolerHeight.ok(cooler.heightMm, maxH),
    resolution: m.coolerHeight.resolution,
    categories,
  });
};

export const ramClearanceRule: Rule = ({ cooler, ram }) => {
  // Only tower coolers overhang the DIMM slots.
  if (!cooler || !ram || cooler.kind !== "air" || cooler.heightMm < 100) return null;
  const categories: ComponentCategory[] = ["cooler", "ram"];
  if (!known(cooler.maxRamHeightMm)) {
    return check("ramClearance", { rule: "ram-clearance", status: "unknown", unknownReason: "missing-data", detail: m.ramClearance.unknown, categories });
  }
  const ok = ram.heightMm <= cooler.maxRamHeightMm;
  return check("ramClearance", {
    rule: "ram-clearance",
    status: ok ? "compatible" : "warning",
    detail: ok ? m.ramClearance.ok(ram.heightMm, cooler.maxRamHeightMm) : m.ramClearance.verify(ram.heightMm, cooler.maxRamHeightMm),
    resolution: m.ramClearance.resolution,
    categories,
  });
};

export const coolerCapacityRule: Rule = ({ cooler, cpu }) => {
  if (!cooler || !cpu) return null;
  const categories: ComponentCategory[] = ["cooler", "cpu"];
  if (cooler.kind === "aio") {
    if (!known(cooler.radiatorMm)) return null;
    // Rule of thumb by radiator size — labelled as an estimate in the text.
    const tight = (cooler.radiatorMm <= 240 && cpu.peakPowerW > 230) || (cooler.radiatorMm <= 120 && cpu.peakPowerW > 150);
    return check("coolerCapacity", {
      rule: "cooler-capacity",
      status: tight ? "warning" : "compatible",
      severity: tight ? "minor" : undefined,
      detail: tight ? m.coolerCapacity.aioTight(cooler.radiatorMm, cpu.peakPowerW) : m.coolerCapacity.aioOk(cooler.radiatorMm, cpu.peakPowerW),
      resolution: m.coolerCapacity.resolution,
      categories,
    });
  }
  if (known(cooler.ratedTdpW)) {
    const ok = cpu.peakPowerW <= cooler.ratedTdpW;
    return check("coolerCapacity", {
      rule: "cooler-capacity",
      status: ok ? "compatible" : "warning",
      detail: ok ? m.coolerCapacity.ok(cpu.peakPowerW, cooler.ratedTdpW) : m.coolerCapacity.verify(cpu.peakPowerW, cooler.ratedTdpW),
      resolution: m.coolerCapacity.resolution,
      categories,
    });
  }
  if (cooler.heightMm < 70 && cpu.peakPowerW > 100) {
    return check("coolerCapacity", { rule: "cooler-capacity", status: "warning", detail: m.coolerCapacity.lowProfile(cpu.peakPowerW), resolution: m.coolerCapacity.resolution, categories });
  }
  return check("coolerCapacity", { rule: "cooler-capacity", status: "unknown", unknownReason: "missing-data", detail: m.coolerCapacity.unknown(cpu.peakPowerW), categories });
};

export const psuCapacityRule: Rule = (b) => {
  const { psu, cpu, gpu } = b;
  if (!psu) return null;
  const categories: ComponentCategory[] = ["psu", "gpu", "cpu"];
  if (!cpu) return check("psuCapacity", { rule: "psu-capacity", status: "unknown", detail: m.psuCapacity.missing, categories });
  const peak = estimatePeakPower(b)!;
  const rec = recommendedPsuWattage(b)!;
  const status: CheckStatus = psu.wattage < peak ? "incompatible" : psu.wattage < rec ? "warning" : "compatible";
  const suffix = gpu ? "" : m.psuCapacity.noGpu;
  const checks = [
    check("psuCapacity", {
      rule: "psu-capacity",
      status,
      detail:
        (status === "incompatible"
          ? m.psuCapacity.bad(peak, psu.wattage)
          : status === "warning"
            ? m.psuCapacity.verify(peak, rec, psu.wattage)
            : m.psuCapacity.ok(peak, rec, psu.wattage)) + suffix,
      resolution: m.psuCapacity.resolution(rec),
      categories,
    }),
  ];
  if (gpu && gpu.boardPowerW >= 300 && !psu.atx3 && status !== "incompatible") {
    checks.push(
      check("psuTransient", {
        rule: "psu-transient",
        status: "warning",
        severity: "minor",
        detail: m.psuTransient.warn(gpu.boardPowerW),
        resolution: m.psuTransient.resolution,
        categories: ["psu", "gpu"],
      }),
    );
  }
  return checks;
};

export const psuConnectorsRule: Rule = ({ psu, gpu }) => {
  if (!psu || !gpu) return null;
  const categories: ComponentCategory[] = ["psu", "gpu"];
  if (gpu.powerConnectors.length === 0) {
    return check("psuConnectors", { rule: "psu-connectors", status: "compatible", detail: m.psuConnectors.slotPowered, categories });
  }
  // 6-pin and 8-pin sockets are both served by the PSU's 6+2-pin cables, so count them together.
  const legacy = gpu.powerConnectors.filter((c) => c.type !== "12V-2x6").reduce((n, c) => n + c.count, 0);
  const needs = [...gpu.powerConnectors.filter((c) => c.type === "12V-2x6"), ...(legacy ? [{ type: "8pin" as const, count: legacy }] : [])];
  return needs.map((conn) => {
    if (conn.type === "12V-2x6") {
      if (psu.native12v2x6 >= conn.count) return check("psuConnectors", { rule: "psu-connectors", status: "compatible", detail: m.psuConnectors.ok12v, categories });
      const need = adapterPinsFor(gpu.boardPowerW);
      const ok = psu.pcie8pin >= need;
      return check("psuConnectors", {
        rule: "psu-connectors",
        status: ok ? "warning" : "incompatible",
        detail: ok ? m.psuConnectors.adapter(need) : m.psuConnectors.bad12(need, psu.pcie8pin),
        resolution: m.psuConnectors.resolution,
        categories,
      });
    }
    const ok = psu.pcie8pin >= conn.count;
    return check("psuConnectors", {
      rule: "psu-connectors",
      status: ok ? "compatible" : "incompatible",
      detail: ok ? m.psuConnectors.ok8(conn.count, psu.pcie8pin) : m.psuConnectors.bad8(conn.count, psu.pcie8pin),
      resolution: m.psuConnectors.resolution8,
      categories,
    });
  });
};

export const psuFormFactorRule: Rule = ({ psu, case: pcCase }) => {
  if (!psu || !pcCase) return null;
  const categories: ComponentCategory[] = ["psu", "case"];
  if (pcCase.supportedPsu.includes(psu.formFactor)) return check("psuFormFactor", { rule: "psu-form", status: "compatible", detail: m.psuFormFactor.ok(psu.formFactor), categories });
  if (psu.formFactor === "SFX" && pcCase.supportedPsu.includes("ATX")) {
    return check("psuFormFactor", { rule: "psu-form", status: "warning", severity: "minor", detail: m.psuFormFactor.sfxInAtx, resolution: m.psuFormFactor.resolution, categories });
  }
  return check("psuFormFactor", {
    rule: "psu-form",
    status: "incompatible",
    detail: m.psuFormFactor.bad(psu.formFactor, join(pcCase.supportedPsu)),
    resolution: m.psuFormFactor.resolution,
    categories,
  });
};

export const storageRule: Rule = ({ storage, motherboard, case: pcCase }) => {
  if (storage.length === 0 || !motherboard) return null;
  const checks: CompatibilityCheck[] = [];
  const nvme = storage.filter((s) => s.interface === "NVMe");
  const sata = storage.filter((s) => s.interface === "SATA");
  if (nvme.length) {
    const ok = nvme.length <= motherboard.m2Slots;
    checks.push(
      check("storageM2", {
        rule: "storage-m2",
        status: ok ? "compatible" : "incompatible",
        detail: ok ? m.storageM2.ok(nvme.length, motherboard.m2Slots) : m.storageM2.bad(nvme.length, motherboard.m2Slots),
        resolution: m.storageM2.resolution,
        categories: ["storage", "motherboard"],
      }),
    );
    for (const d of nvme) {
      if (d.pcieGen && d.pcieGen > motherboard.m2MaxGen) {
        checks.push(check("storageGen", { id: `storage-gen-${d.id}`, rule: "storage-gen", status: "compatible", detail: m.storageGen.slower(d.name, d.pcieGen, motherboard.m2MaxGen), categories: ["storage", "motherboard"] }));
      }
    }
  }
  if (sata.length) {
    const hdd = sata.filter((s) => s.formFactor === "3.5in").length;
    const ssd25 = sata.length - hdd;
    const portsOk = sata.length <= motherboard.sataPorts;
    // 3.5″ drives need 3.5″ bays; 2.5″ drives use 2.5″ bays or any 3.5″ bays left over.
    const baysOk = !pcCase || (hdd <= pcCase.drive35Bays && ssd25 <= pcCase.drive25Bays + (pcCase.drive35Bays - hdd));
    const ok = portsOk && baysOk;
    checks.push(
      check("storageSata", {
        rule: "storage-sata",
        status: !pcCase ? (portsOk ? "unknown" : "incompatible") : ok ? "compatible" : "incompatible",
        detail: (ok ? m.storageSata.ok : m.storageSata.bad)(sata.length, motherboard.sataPorts, pcCase?.drive25Bays ?? 0, pcCase?.drive35Bays ?? 0, hdd),
        resolution: m.storageSata.resolution,
        categories: ["storage", "motherboard", "case"],
      }),
    );
  }
  return checks;
};

const FAN_POSITION_LABEL: Record<FanPosition, string> = { front: "спереди", side: "сбоку", bottom: "снизу", rear: "сзади", top: "сверху" };
const listRu = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} и ${xs[xs.length - 1]}`);

export const fansRule: Rule = (b) => {
  const { fans, case: pcCase, gpu } = b;
  if (!fans || !pcCase) return null;
  const count = fanCountOf(b);
  const ok = count <= pcCase.fanSlots120;
  const checks = [
    check("fans", {
      rule: "fans",
      status: ok ? "compatible" : "incompatible",
      detail: ok ? m.fans.ok(count, pcCase.fanSlots120) : m.fans.bad(count, pcCase.fanSlots120),
      resolution: m.fans.resolution,
      categories: ["fans", "case"],
    }),
  ];
  const fit = computeFit(b)?.fans;
  if (!ok || !fit) return checks;
  const placed = fit.poses.length;
  const where = listRu(fit.positions.map((p) => FAN_POSITION_LABEL[p]));
  const categories: ComponentCategory[] = ["fans", "case", ...(gpu ? (["gpu"] as const) : []), ...(fit.frontBlockedByRadiator ? (["cooler"] as const) : [])];
  if (placed < fit.requested) {
    checks.push(check("fansFit", { rule: "fans-fit", status: "incompatible", detail: m.fansFit.bad(fit.requested, placed), resolution: m.fansFit.resolution, categories }));
  } else if (fit.frontBlockedByGpu && gpu) {
    checks.push(
      check("fansFit", { rule: "fans-fit", status: "warning", severity: "minor", detail: m.fansFit.movedByGpu(placed, gpu.lengthMm, where), resolution: m.fansFit.resolution, categories }),
    );
  } else {
    const detail = fit.frontBlockedByRadiator ? m.fansFit.movedByRadiator(placed, where) : m.fansFit.ok(placed, where);
    checks.push(check("fansFit", { rule: "fans-fit", status: "compatible", detail, categories }));
  }
  return checks;
};

/**
 * Balance between parts (model/rule based, never blocking): flags a strongly mismatched CPU/GPU pair
 * and memory that holds the platform back. Percentages and wording come from balance.ts.
 */
export const balanceRule: Rule = (b) => {
  if (!b.cpu || !b.gpu) return null;
  const report = analyzeBalance(b);
  const checks: CompatibilityCheck[] = [];
  const pair = report.items.find((i) => i.id === "cpu-gpu")!;
  // Warn when the CPU leaves the graphics card idle; being GPU-bound is the normal case for games
  // and is only flagged when the mismatch is extreme.
  const flagged = pair.status === "poor" || (pair.status === "fair" && pair.limiter === "cpu");
  if (pair.scorePct !== null) {
    checks.push(
      check("balanceCpuGpu", {
        rule: "balance-cpu-gpu",
        status: flagged ? "warning" : "compatible",
        severity: !flagged ? undefined : pair.status === "poor" ? "major" : "minor",
        detail: `Баланс ~${pair.scorePct}%. ${pair.summary} ${pair.detail}`,
        resolution: pair.advice ?? m.balanceCpuGpu.resolution,
        categories: ["cpu", "gpu"],
      }),
    );
  }
  const ram = report.items.find((i) => i.id === "ram")!;
  // Channel count is reported by the memory-population check; here only capacity/type/platform.
  if (b.ram && ram.scorePct !== null && ram.status !== "good" && (b.ram.moduleSizeGb * b.ramCount < 16 || b.ram.type === "DDR3")) {
    checks.push(
      check("balanceRam", {
        rule: "balance-ram",
        status: "warning",
        severity: ram.status === "poor" ? "major" : "minor",
        detail: `Соответствие ~${ram.scorePct}%. ${ram.detail}`,
        resolution: ram.advice ?? m.balanceRam.resolution,
        categories: ["ram", "cpu", "gpu"],
      }),
    );
  }
  return checks;
};

export const RULES: Rule[] = [
  completenessRule,
  socketRule,
  biosRule,
  formFactorRule,
  memoryTypeRule,
  cpuMemoryRule,
  memorySpeedRule,
  memorySlotsRule,
  coolerSocketRule,
  coolerClearanceRule,
  ramClearanceRule,
  coolerCapacityRule,
  gpuLengthRule,
  gpuSlotsRule,
  pcieRule,
  displayOutputRule,
  psuCapacityRule,
  psuConnectorsRule,
  psuFormFactorRule,
  storageRule,
  fansRule,
  balanceRule,
];
