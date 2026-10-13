import type { HardwareComponent } from "@/types/hardware";

export interface SpecItem {
  label: string;
  value: string;
}

/** Key specs per category for cards (short) and detail views (full). */
export function keySpecs(c: HardwareComponent, full = false): SpecItem[] {
  const s: SpecItem[] = (() => {
    switch (c.category) {
      case "case":
        return [
          { label: "Платы", value: c.supportedBoards.join(" / ") },
          { label: "GPU до", value: `${c.maxGpuLengthMm} мм` },
          { label: "Кулер до", value: `${c.maxCpuCoolerHeightMm} мм` },
          { label: "БП", value: c.supportedPsu.join(" / ") },
          { label: "Радиаторы", value: `${c.radiatorSupportMm.join(", ")} мм` },
          { label: "Места 120 мм", value: String(c.fanSlots120) },
          { label: "Отсеки 2.5″/3.5″", value: `${c.drive25Bays}/${c.drive35Bays}` },
          { label: "Габариты", value: `${c.exteriorMm.width}×${c.exteriorMm.height}×${c.exteriorMm.depth} мм` },
        ];
      case "motherboard":
        return [
          { label: "Сокет", value: c.socket },
          { label: "Чипсет", value: c.chipset },
          { label: "Формат", value: c.formFactor },
          { label: "Память", value: `${c.memoryType} ×${c.memorySlots}` },
          { label: "Макс. ОЗУ", value: `${c.maxMemoryGb} ГБ` },
          { label: "M.2", value: `${c.m2Slots} шт., до PCIe ${c.m2MaxGen}.0` },
          { label: "PCIe x16", value: `${c.pcieX16Gen}.0` },
          { label: "SATA", value: String(c.sataPorts) },
        ];
      case "cpu":
        return [
          { label: "Сокет", value: c.socket },
          { label: "Ядра/потоки", value: `${c.cores}/${c.threads}` },
          { label: "Частота", value: `${c.baseClockGhz}–${c.boostClockGhz} ГГц` },
          { label: "TDP", value: `${c.tdpW} Вт` },
          { label: "Пик", value: `${c.peakPowerW} Вт` },
          { label: "Память", value: c.memorySupport.join(" / ") },
          { label: "iGPU", value: c.integratedGraphics ? "Есть" : "Нет" },
          { label: "Поколение", value: c.family },
          { label: "PCIe", value: `${c.pcieGen}.0` },
          { label: "Индекс (модель)", value: String(c.gamingIndex) },
        ];
      case "cooler":
        return [
          { label: "Тип", value: c.kind === "aio" ? `СЖО ${c.radiatorMm} мм` : "Башня" },
          { label: c.kind === "aio" ? "Помпа" : "Высота", value: `${c.heightMm} мм` },
          { label: "Сокеты", value: c.sockets.join(", ") },
          ...(c.maxRamHeightMm ? [{ label: "ОЗУ до", value: `${c.maxRamHeightMm} мм` }] : []),
          ...(c.ratedTdpW ? [{ label: "Теплоотвод", value: `${c.ratedTdpW} Вт` }] : []),
        ];
      case "ram":
        return [
          { label: "Тип", value: c.type },
          { label: "Модуль", value: `${c.moduleSizeGb} ГБ` },
          { label: "Частота", value: `${c.speedMtps} МТ/с` },
          { label: "CL", value: String(c.casLatency) },
          { label: "Высота", value: `${c.heightMm} мм` },
          { label: "Подсветка", value: c.rgb ? "RGB" : "Нет" },
        ];
      case "gpu":
        return [
          { label: "VRAM", value: `${c.vramGb} ГБ ${c.memoryType}` },
          { label: "Длина", value: `${c.lengthMm} мм` },
          { label: "Мощность", value: `${c.boardPowerW} Вт` },
          { label: "Толщина", value: `${c.slots} слота` },
          { label: "Чип", value: c.chip },
          { label: "Архитектура", value: c.architecture },
          { label: c.chipVendor === "NVIDIA" ? "CUDA-ядра" : "Потоковые проц.", value: String(c.shaderUnits) },
          { label: "Boost", value: `${c.boostClockMhz} МГц` },
          { label: "Шина памяти", value: `${c.busWidthBits} бит` },
          {
            label: "Питание",
            value: c.powerConnectors.length
              ? c.powerConnectors.map((p) => `${p.count}×${p.type === "12V-2x6" ? "12V-2x6" : p.type === "8pin" ? "8-pin" : "6-pin"}`).join(" + ")
              : "От слота PCIe",
          },
          { label: "Рек. БП", value: `${c.recommendedPsuW} Вт` },
          { label: "PCIe", value: `${c.pcieGen}.0 x${c.pcieLanes}` },
          { label: "Трассировка", value: c.rayTracing ? "Аппаратная" : "Нет" },
          { label: "Индекс (модель)", value: `${c.rasterIndex}${c.rayTracing ? ` / RT ${c.rtIndex}` : ""}` },
        ];
      case "storage":
        return [
          { label: "Тип", value: c.kind === "hdd" ? `HDD ${c.rpm} об/мин` : c.interface === "NVMe" ? `NVMe PCIe ${c.pcieGen}.0` : "SSD SATA" },
          { label: "Объём", value: c.capacityGb >= 1000 ? `${+(c.capacityGb / 1000).toFixed(1)} ТБ` : `${c.capacityGb} ГБ` },
          { label: "Чтение", value: `${c.readMBps} МБ/с` },
          { label: "Запись", value: `${c.writeMBps} МБ/с` },
          { label: "Формат", value: c.formFactor },
        ];
      case "psu":
        return [
          { label: "Мощность", value: `${c.wattage} Вт` },
          { label: "Формат", value: c.formFactor },
          { label: "Сертификат", value: c.efficiency },
          { label: "12V-2x6", value: c.native12v2x6 ? "Нативный" : "Нет" },
          { label: "8-pin PCIe", value: String(c.pcie8pin) },
          { label: "ATX 3.x", value: c.atx3 ? "Да" : "Нет" },
        ];
      case "fans":
        return [
          { label: "Размер", value: `${c.sizeMm} мм` },
          { label: "Кол-во", value: `${c.count} шт.` },
          { label: "Обороты", value: `до ${c.maxRpm}` },
          { label: "RGB", value: c.rgb ? "Да" : "Нет" },
        ];
    }
  })();
  return full ? s : s.slice(0, 4);
}

/** Single numeric "performance" key used for sorting where it makes sense. */
export function perfKey(c: HardwareComponent): number {
  switch (c.category) {
    case "gpu":
      return c.rasterIndex;
    case "cpu":
      return c.gamingIndex;
    case "ram":
      return c.speedMtps * c.moduleSizeGb;
    case "storage":
      return c.readMBps;
    case "psu":
      return c.wattage;
    case "cooler":
      return c.kind === "aio" ? 1000 + (c.radiatorMm ?? 0) : c.heightMm;
    default:
      return c.price.amountRub;
  }
}
