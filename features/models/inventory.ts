import { ALL_COMPONENTS } from "@/components/PcComponents";
import { CATEGORY_ORDER, type ComponentCategory, type HardwareComponent } from "@/types/hardware";
import { assetFor, assetKeysFor, GLB_CATEGORIES, MODEL_ASSETS, supportsAsset, type ModelAsset } from "./registry";

/**
 * Inventory of 3D models: for every catalog component, which model it renders today (a GLB from
 * the registry or the procedural model) and under which keys a GLB can be registered.
 * The procedural model of a category may be deleted only when every component of it has a GLB.
 */

/** Procedural model per category (components/builder/scene/models.tsx). */
export const PROCEDURAL_MODEL: Record<ComponentCategory, string> = {
  case: "CaseModel",
  motherboard: "MotherboardModel",
  cpu: "CpuModel",
  cooler: "CoolerModel (+ AioRadiator)",
  ram: "RamModel",
  gpu: "GpuModel",
  storage: "StorageModel",
  psu: "PsuModel",
  fans: "FanPackModel / FanUnit",
};

export interface InventoryItem {
  id: string;
  category: ComponentCategory;
  brand: string;
  name: string;
  /** Keys a GLB can be registered under, most specific first (empty when the category is procedural-only). */
  keys: string[];
  source: "glb" | "procedural";
  modelUrl: string | null;
  /** Registry key that supplied the GLB. */
  matchedKey: string | null;
}

export interface InventoryCategory {
  category: ComponentCategory;
  procedural: string;
  glbSupported: boolean;
  total: number;
  withGlb: number;
  /** True when every component has a GLB — only then the procedural model can be removed. */
  proceduralRemovable: boolean;
  items: InventoryItem[];
}

function matchedKey(c: HardwareComponent, extra?: Record<string, ModelAsset>) {
  return assetKeysFor(c).find((k) => (extra?.[k] ?? MODEL_ASSETS[k])?.modelUrl) ?? null;
}

export function buildInventory(components: HardwareComponent[] = ALL_COMPONENTS, extra?: Record<string, ModelAsset>): InventoryCategory[] {
  return CATEGORY_ORDER.map((category) => {
    const items = components
      .filter((c) => c.category === category)
      .map((c): InventoryItem => {
        const asset = assetFor(c, extra);
        const url = asset?.modelUrl ?? null;
        return {
          id: c.id,
          category,
          brand: c.brand,
          name: c.name,
          keys: supportsAsset(category) ? assetKeysFor(c) : [],
          source: url ? "glb" : "procedural",
          modelUrl: url,
          matchedKey: url ? matchedKey(c, extra) : null,
        };
      });
    const withGlb = items.filter((i) => i.source === "glb").length;
    return {
      category,
      procedural: PROCEDURAL_MODEL[category],
      glbSupported: GLB_CATEGORIES.includes(category),
      total: items.length,
      withGlb,
      proceduralRemovable: items.length > 0 && withGlb === items.length,
      items,
    };
  });
}

const csvCell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV (UTF-8 with BOM for Excel) with one row per component. */
export function inventoryCsv(inv: InventoryCategory[], categoryLabel: (c: ComponentCategory) => string = (c) => c): string {
  const head = ["Категория", "Бренд", "Модель", "ID компонента", "Сейчас", "Процедурная модель", "Путь к GLB", "Ключ для точной модели", "Общий ключ", "GLB поддерживается"];
  const rows = inv.flatMap((cat) =>
    cat.items.map((i) => [categoryLabel(i.category), i.brand, i.name, i.id, i.source === "glb" ? "GLB" : "процедурная", cat.procedural, i.modelUrl ?? "", i.keys[0] ?? "", i.keys.slice(1).join(" | "), cat.glbSupported ? "да" : "нет (составная модель)"]),
  );
  return "﻿" + [head, ...rows].map((r) => r.map((v) => csvCell(String(v))).join(";")).join("\r\n") + "\r\n";
}
