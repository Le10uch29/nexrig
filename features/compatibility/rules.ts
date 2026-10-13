import { adapterPinsFor, estimatePeakPower, recommendedPsuWattage } from "@/lib/hardware/power";
import type { ResolvedBuild } from "@/lib/hardware/repository";
import { getMessages } from "@/lib/i18n";
import type { CompatibilityCheck } from "@/types/compatibility";
import { compatMessages as m } from "./messages.ru";

/**
 * Each rule inspects a resolved build and returns zero or more checks.
 * Rules never guess: a missing spec or missing counterpart yields "insufficient", an unknowable
 * condition (BIOS version, adapters) yields "verify".
 */
export type Rule = (b: ResolvedBuild) => CompatibilityCheck | CompatibilityCheck[] | null;

const join = (xs: readonly string[]) => xs.join(", ");

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
  return {
    id: "completeness",
    rule: "completeness",
    title: m.completeness.title,
    status: missing.length ? "insufficient" : "compatible",
    detail: missing.length ? m.completeness.missing(missing.join(", ").toLowerCase()) : m.completeness.ok,
    resolution: missing.length ? m.completeness.resolution : undefined,
    categories: [],
  };
};

export const socketRule: Rule = ({ cpu, motherboard }) => {
  if (!cpu && !motherboard) return null;
  if (!cpu || !motherboard)
    return { id: "socket", rule: "socket", title: m.socket.title, status: "insufficient", detail: m.socket.missing, categories: ["cpu", "motherboard"] };
  const ok = cpu.socket === motherboard.socket;
  return {
    id: "socket",
    rule: "socket",
    title: m.socket.title,
    status: ok ? "compatible" : "incompatible",
    detail: ok ? m.socket.ok(cpu.socket) : m.socket.bad(cpu.socket, motherboard.socket),
    resolution: ok ? undefined : m.socket.resolution(cpu.socket),
    categories: ["cpu", "motherboard"],
  };
};

export const biosRule: Rule = ({ cpu, motherboard }) => {
  if (!cpu || !motherboard || cpu.socket !== motherboard.socket) return null;
  if (motherboard.unsupportedFamilies.includes(cpu.family)) {
    return {
      id: "bios",
      rule: "chipset-support",
      title: m.bios.title,
      status: "incompatible",
      detail: m.bios.unsupported(cpu.family, motherboard.chipset),
      resolution: m.bios.unsupportedResolution,
      categories: ["cpu", "motherboard"],
    };
  }
  const needsUpdate = motherboard.biosUpdateFamilies.includes(cpu.family);
  return {
    id: "bios",
    rule: "bios",
    title: m.bios.title,
    status: needsUpdate ? "verify" : "compatible",
    detail: needsUpdate ? m.bios.verify(cpu.name, motherboard.name) : m.bios.ok,
    resolution: needsUpdate ? m.bios.resolution : undefined,
    categories: ["cpu", "motherboard"],
  };
};

export const memoryTypeRule: Rule = ({ ram, motherboard }) => {
  if (!ram && !motherboard) return null;
  if (!ram || !motherboard)
    return { id: "memory-type", rule: "memory-type", title: m.memoryType.title, status: "insufficient", detail: m.memoryType.missing, categories: ["ram", "motherboard"] };
  const ok = ram.type === motherboard.memoryType;
  return {
    id: "memory-type",
    rule: "memory-type",
    title: m.memoryType.title,
    status: ok ? "compatible" : "incompatible",
    detail: ok ? m.memoryType.ok(ram.type) : m.memoryType.bad(ram.type, motherboard.memoryType),
    resolution: ok ? undefined : m.memoryType.resolution(motherboard.memoryType),
    categories: ["ram", "motherboard"],
  };
};

export const cpuMemoryRule: Rule = ({ ram, cpu }) => {
  if (!ram || !cpu) return null;
  const ok = cpu.memorySupport.includes(ram.type);
  return {
    id: "cpu-memory",
    rule: "cpu-memory",
    title: m.cpuMemory.title,
    status: ok ? "compatible" : "incompatible",
    detail: ok ? m.cpuMemory.ok(ram.type) : m.cpuMemory.bad(ram.type, join(cpu.memorySupport)),
    resolution: ok ? undefined : m.cpuMemory.resolution,
    categories: ["ram", "cpu"],
  };
};

export const memorySlotsRule: Rule = ({ ram, ramCount, motherboard }) => {
  if (!ram || !motherboard || ram.type !== motherboard.memoryType) return null;
  const modules = ramCount;
  const totalGb = modules * ram.moduleSizeGb;
  const checks: CompatibilityCheck[] = [];
  if (modules > motherboard.memorySlots) {
    checks.push({
      id: "memory-slots",
      rule: "memory-slots",
      title: m.memorySlots.title,
      status: "incompatible",
      detail: m.memorySlots.tooMany(modules, motherboard.memorySlots),
      resolution: m.memorySlots.resolution,
      categories: ["ram", "motherboard"],
    });
  } else if (totalGb > motherboard.maxMemoryGb) {
    checks.push({
      id: "memory-slots",
      rule: "memory-slots",
      title: m.memorySlots.title,
      status: "incompatible",
      detail: m.memorySlots.tooMuch(totalGb, motherboard.maxMemoryGb),
      resolution: m.memorySlots.resolution,
      categories: ["ram", "motherboard"],
    });
  } else {
    checks.push({
      id: "memory-slots",
      rule: "memory-slots",
      title: m.memorySlots.title,
      status: "compatible",
      detail: m.memorySlots.ok(modules, motherboard.memorySlots, totalGb, motherboard.maxMemoryGb),
      categories: ["ram", "motherboard"],
    });
    // Channel layout: one module runs single-channel, three are asymmetric, four DDR5 lower clocks.
    const population =
      modules === 1
        ? { title: m.memoryPopulation.singleTitle, detail: m.memoryPopulation.single, resolution: m.memoryPopulation.singleResolution }
        : modules === 3
          ? { title: m.memoryPopulation.oddTitle, detail: m.memoryPopulation.odd, resolution: m.memoryPopulation.oddResolution }
          : ram.type === "DDR5" && modules >= 4
            ? { title: m.memoryPopulation.title, detail: m.memoryPopulation.verify, resolution: m.memoryPopulation.resolution }
            : null;
    if (population) {
      checks.push({ id: "memory-population", rule: "memory-population", status: "verify", categories: ["ram"], ...population });
    }
  }
  return checks;
};

export const formFactorRule: Rule = ({ case: pcCase, motherboard }) => {
  if (!pcCase && !motherboard) return null;
  if (!pcCase || !motherboard)
    return { id: "form-factor", rule: "form-factor", title: m.formFactor.title, status: "insufficient", detail: m.formFactor.missing, categories: ["case", "motherboard"] };
  const ok = pcCase.supportedBoards.includes(motherboard.formFactor);
  return {
    id: "form-factor",
    rule: "form-factor",
    title: m.formFactor.title,
    status: ok ? "compatible" : "incompatible",
    detail: ok ? m.formFactor.ok(motherboard.formFactor) : m.formFactor.bad(motherboard.formFactor, join(pcCase.supportedBoards)),
    resolution: ok ? undefined : m.formFactor.resolution,
    categories: ["case", "motherboard"],
  };
};

export const gpuLengthRule: Rule = ({ gpu, case: pcCase }) => {
  if (!gpu) return null;
  if (!pcCase)
    return { id: "gpu-length", rule: "gpu-length", title: m.gpuLength.title, status: "insufficient", detail: m.gpuLength.missing, categories: ["gpu", "case"] };
  const margin = pcCase.maxGpuLengthMm - gpu.lengthMm;
  const status = margin < 0 ? "incompatible" : margin < 10 ? "verify" : "compatible";
  return {
    id: "gpu-length",
    rule: "gpu-length",
    title: m.gpuLength.title,
    status,
    detail:
      status === "incompatible"
        ? m.gpuLength.bad(gpu.lengthMm, pcCase.maxGpuLengthMm)
        : status === "verify"
          ? m.gpuLength.tight(gpu.lengthMm, pcCase.maxGpuLengthMm)
          : m.gpuLength.ok(gpu.lengthMm, pcCase.maxGpuLengthMm),
    resolution: status === "compatible" ? undefined : m.gpuLength.resolution,
    categories: ["gpu", "case"],
  };
};

export const pcieRule: Rule = ({ gpu, motherboard }) => {
  if (!gpu || !motherboard) return null;
  return {
    id: "pcie",
    rule: "pcie",
    title: m.pcie.title,
    status: "compatible",
    detail: m.pcie.ok(gpu.pcieGen, motherboard.pcieX16Gen),
    categories: ["gpu", "motherboard"],
  };
};

export const displayOutputRule: Rule = ({ gpu, cpu }) => {
  if (gpu || !cpu) return null;
  return {
    id: "display",
    rule: "display",
    title: m.display.title,
    status: cpu.integratedGraphics ? "compatible" : "incompatible",
    detail: cpu.integratedGraphics ? m.display.igpu : m.display.none,
    resolution: cpu.integratedGraphics ? undefined : m.display.resolution,
    categories: ["gpu", "cpu"],
  };
};

export const coolerSocketRule: Rule = ({ cooler, cpu }) => {
  if (!cooler) return null;
  if (!cpu)
    return { id: "cooler-socket", rule: "cooler-socket", title: m.coolerSocket.title, status: "insufficient", detail: m.coolerSocket.missing, categories: ["cooler", "cpu"] };
  const ok = cooler.sockets.includes(cpu.socket);
  return {
    id: "cooler-socket",
    rule: "cooler-socket",
    title: m.coolerSocket.title,
    status: ok ? "compatible" : "incompatible",
    detail: ok ? m.coolerSocket.ok(cpu.socket) : m.coolerSocket.bad(cpu.socket, join(cooler.sockets)),
    resolution: ok ? undefined : m.coolerSocket.resolution,
    categories: ["cooler", "cpu"],
  };
};

export const coolerClearanceRule: Rule = ({ cooler, case: pcCase }) => {
  if (!cooler) return null;
  if (!pcCase)
    return { id: "cooler-height", rule: "cooler-height", title: m.coolerHeight.title, status: "insufficient", detail: m.coolerHeight.missing, categories: ["cooler", "case"] };
  if (cooler.kind === "aio") {
    if (cooler.radiatorMm === undefined)
      return { id: "radiator", rule: "radiator", title: m.radiator.title, status: "insufficient", detail: m.radiator.bad(0, join(pcCase.radiatorSupportMm.map(String))), categories: ["cooler", "case"] };
    const ok = pcCase.radiatorSupportMm.includes(cooler.radiatorMm);
    return {
      id: "radiator",
      rule: "radiator",
      title: m.radiator.title,
      status: ok ? "compatible" : "incompatible",
      detail: ok ? m.radiator.ok(cooler.radiatorMm) : m.radiator.bad(cooler.radiatorMm, join(pcCase.radiatorSupportMm.map(String))),
      resolution: ok ? undefined : m.radiator.resolution,
      categories: ["cooler", "case"],
    };
  }
  const margin = pcCase.maxCpuCoolerHeightMm - cooler.heightMm;
  const status = margin < 0 ? "incompatible" : margin < 5 ? "verify" : "compatible";
  return {
    id: "cooler-height",
    rule: "cooler-height",
    title: m.coolerHeight.title,
    status,
    detail:
      status === "incompatible"
        ? m.coolerHeight.bad(cooler.heightMm, pcCase.maxCpuCoolerHeightMm)
        : status === "verify"
          ? m.coolerHeight.tight(cooler.heightMm, pcCase.maxCpuCoolerHeightMm)
          : m.coolerHeight.ok(cooler.heightMm, pcCase.maxCpuCoolerHeightMm),
    resolution: status === "compatible" ? undefined : m.coolerHeight.resolution,
    categories: ["cooler", "case"],
  };
};

export const ramClearanceRule: Rule = ({ cooler, ram }) => {
  if (!cooler || !ram || cooler.maxRamHeightMm === undefined) return null;
  const ok = ram.heightMm <= cooler.maxRamHeightMm;
  return {
    id: "ram-clearance",
    rule: "ram-clearance",
    title: m.ramClearance.title,
    status: ok ? "compatible" : "verify",
    detail: ok ? m.ramClearance.ok(ram.heightMm, cooler.maxRamHeightMm) : m.ramClearance.verify(ram.heightMm, cooler.maxRamHeightMm),
    resolution: ok ? undefined : m.ramClearance.resolution,
    categories: ["cooler", "ram"],
  };
};

export const coolerCapacityRule: Rule = ({ cooler, cpu }) => {
  if (!cooler || !cpu || cooler.kind !== "air") return null;
  if (cooler.ratedTdpW !== undefined) {
    const ok = cpu.peakPowerW <= cooler.ratedTdpW;
    return {
      id: "cooler-capacity",
      rule: "cooler-capacity",
      title: m.coolerCapacity.title,
      status: ok ? "compatible" : "verify",
      detail: ok ? m.coolerCapacity.ok(cpu.peakPowerW, cooler.ratedTdpW) : m.coolerCapacity.verify(cpu.peakPowerW, cooler.ratedTdpW),
      resolution: ok ? undefined : m.coolerCapacity.resolution,
      categories: ["cooler", "cpu"],
    };
  }
  // No published rating: only flag the clear-cut low-profile case.
  if (cooler.heightMm < 70 && cpu.peakPowerW > 100) {
    return {
      id: "cooler-capacity",
      rule: "cooler-capacity",
      title: m.coolerCapacity.title,
      status: "verify",
      detail: m.coolerCapacity.lowProfile(cpu.peakPowerW),
      resolution: m.coolerCapacity.resolution,
      categories: ["cooler", "cpu"],
    };
  }
  return null;
};

export const psuCapacityRule: Rule = (b) => {
  const { psu, cpu, gpu } = b;
  if (!psu) return null;
  if (!cpu)
    return { id: "psu-capacity", rule: "psu-capacity", title: m.psuCapacity.title, status: "insufficient", detail: m.psuCapacity.missing, categories: ["psu", "cpu"] };
  const peak = estimatePeakPower(b)!;
  const rec = recommendedPsuWattage(b)!;
  const status = psu.wattage < peak ? "incompatible" : psu.wattage < rec ? "verify" : "compatible";
  const suffix = gpu ? "" : m.psuCapacity.noGpu;
  return {
    id: "psu-capacity",
    rule: "psu-capacity",
    title: m.psuCapacity.title,
    status,
    detail:
      (status === "incompatible"
        ? m.psuCapacity.bad(peak, psu.wattage)
        : status === "verify"
          ? m.psuCapacity.verify(peak, psu.wattage, rec)
          : m.psuCapacity.ok(peak, psu.wattage)) + suffix,
    resolution: status === "compatible" ? undefined : m.psuCapacity.resolution(rec),
    categories: ["psu", "gpu", "cpu"],
  };
};

export const psuConnectorsRule: Rule = ({ psu, gpu }) => {
  if (!psu || !gpu) return null;
  const checks: CompatibilityCheck[] = [];
  if (gpu.powerConnectors.length === 0) {
    return { id: "psu-connectors", rule: "psu-connectors", title: m.psuConnectors.title, status: "compatible", detail: m.psuConnectors.slotPowered, categories: ["psu", "gpu"] };
  }
  // 6-pin and 8-pin sockets are both served by the PSU's 6+2-pin cables, so count them together.
  const legacy = gpu.powerConnectors.filter((c) => c.type !== "12V-2x6").reduce((n, c) => n + c.count, 0);
  const needs = [
    ...gpu.powerConnectors.filter((c) => c.type === "12V-2x6"),
    ...(legacy ? [{ type: "8pin" as const, count: legacy }] : []),
  ];
  for (const conn of needs) {
    if (conn.type === "12V-2x6") {
      if (psu.native12v2x6 >= conn.count) {
        checks.push({ id: "psu-connectors", rule: "psu-connectors", title: m.psuConnectors.title, status: "compatible", detail: m.psuConnectors.ok12v, categories: ["psu", "gpu"] });
      } else {
        const need = adapterPinsFor(gpu.boardPowerW);
        const ok = psu.pcie8pin >= need;
        checks.push({
          id: "psu-connectors",
          rule: "psu-connectors",
          title: m.psuConnectors.title,
          status: ok ? "verify" : "incompatible",
          detail: ok ? m.psuConnectors.adapter(need) : m.psuConnectors.bad12(need, psu.pcie8pin),
          resolution: m.psuConnectors.resolution,
          categories: ["psu", "gpu"],
        });
      }
    } else {
      const ok = psu.pcie8pin >= conn.count;
      checks.push({
        id: "psu-connectors",
        rule: "psu-connectors",
        title: m.psuConnectors.title,
        status: ok ? "compatible" : "incompatible",
        detail: ok ? m.psuConnectors.ok8(conn.count, psu.pcie8pin) : m.psuConnectors.bad8(conn.count, psu.pcie8pin),
        resolution: ok ? undefined : m.psuConnectors.resolution8,
        categories: ["psu", "gpu"],
      });
    }
  }
  return checks;
};

export const psuFormFactorRule: Rule = ({ psu, case: pcCase }) => {
  if (!psu || !pcCase) return null;
  if (pcCase.supportedPsu.includes(psu.formFactor))
    return { id: "psu-form", rule: "psu-form", title: m.psuFormFactor.title, status: "compatible", detail: m.psuFormFactor.ok(psu.formFactor), categories: ["psu", "case"] };
  if (psu.formFactor === "SFX" && pcCase.supportedPsu.includes("ATX"))
    return { id: "psu-form", rule: "psu-form", title: m.psuFormFactor.title, status: "verify", detail: m.psuFormFactor.sfxInAtx, resolution: m.psuFormFactor.resolution, categories: ["psu", "case"] };
  return {
    id: "psu-form",
    rule: "psu-form",
    title: m.psuFormFactor.title,
    status: "incompatible",
    detail: m.psuFormFactor.bad(psu.formFactor, join(pcCase.supportedPsu)),
    resolution: m.psuFormFactor.resolution,
    categories: ["psu", "case"],
  };
};

export const storageRule: Rule = ({ storage, motherboard, case: pcCase }) => {
  if (storage.length === 0 || !motherboard) return null;
  const checks: CompatibilityCheck[] = [];
  const nvme = storage.filter((s) => s.interface === "NVMe");
  const sata = storage.filter((s) => s.interface === "SATA");
  if (nvme.length) {
    const ok = nvme.length <= motherboard.m2Slots;
    checks.push({
      id: "storage-m2",
      rule: "storage-m2",
      title: m.storageM2.title,
      status: ok ? "compatible" : "incompatible",
      detail: ok ? m.storageM2.ok(nvme.length, motherboard.m2Slots) : m.storageM2.bad(nvme.length, motherboard.m2Slots),
      resolution: ok ? undefined : m.storageM2.resolution,
      categories: ["storage", "motherboard"],
    });
    for (const d of nvme) {
      if (d.pcieGen && d.pcieGen > motherboard.m2MaxGen) {
        checks.push({
          id: `storage-gen-${d.id}`,
          rule: "storage-gen",
          title: m.storageGen.title,
          status: "compatible",
          detail: m.storageGen.slower(d.name, d.pcieGen, motherboard.m2MaxGen),
          categories: ["storage", "motherboard"],
        });
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
    checks.push({
      id: "storage-sata",
      rule: "storage-sata",
      title: m.storageSata.title,
      status: !pcCase ? (portsOk ? "insufficient" : "incompatible") : ok ? "compatible" : "incompatible",
      detail: (ok ? m.storageSata.ok : m.storageSata.bad)(sata.length, motherboard.sataPorts, pcCase?.drive25Bays ?? 0, pcCase?.drive35Bays ?? 0, hdd),
      resolution: ok ? undefined : m.storageSata.resolution,
      categories: ["storage", "motherboard", "case"],
    });
  }
  return checks;
};

export const fansRule: Rule = ({ fans, case: pcCase }) => {
  if (!fans || !pcCase) return null;
  const ok = fans.count <= pcCase.fanSlots120;
  return {
    id: "fans",
    rule: "fans",
    title: m.fans.title,
    status: ok ? "compatible" : "incompatible",
    detail: ok ? m.fans.ok(fans.count, pcCase.fanSlots120) : m.fans.bad(fans.count, pcCase.fanSlots120),
    resolution: ok ? undefined : m.fans.resolution,
    categories: ["fans", "case"],
  };
};

export const RULES: Rule[] = [
  completenessRule,
  socketRule,
  biosRule,
  formFactorRule,
  memoryTypeRule,
  cpuMemoryRule,
  memorySlotsRule,
  coolerSocketRule,
  coolerClearanceRule,
  ramClearanceRule,
  coolerCapacityRule,
  gpuLengthRule,
  pcieRule,
  displayOutputRule,
  psuCapacityRule,
  psuConnectorsRule,
  psuFormFactorRule,
  storageRule,
  fansRule,
];
