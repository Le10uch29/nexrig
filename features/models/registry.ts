import type { Vec3 } from "@/features/installation/layout";
import type { ComponentCategory, HardwareComponent } from "@/types/hardware";

/**
 * Unified 3D model description. A component renders a GLB/glTF when an asset with `modelUrl`
 * is registered for it; otherwise (or if loading fails) the procedural model is used.
 *
 * Coordinates follow the procedural model's local origin for that category (see the doc comment
 * on each model in components/builder/scene/models.tsx) so installation anchors keep working.
 */
export interface ModelAsset {
  /** Path under /public/models, e.g. "/models/gpu/rtx-4070-fe.glb". */
  modelUrl?: string;
  /** Uniform or per-axis scale converting the file's units to scene units (1 = 100 mm). */
  scale?: number | Vec3;
  /** Euler rotation (radians) aligning the file's axes with the procedural model's. */
  rotation?: Vec3;
  /** Translation aligning the file's origin with the installation anchor convention. */
  anchorOffset?: Vec3;
  /** Local bounds used for selection boxes and labels (falls back to the procedural bounds). */
  boundingBox?: { center: Vec3; size: Vec3 };
  /** Material tweaks by material name: colour, metalness, roughness, emissive. */
  materialOverrides?: Record<string, { color?: string; metalness?: number; roughness?: number; emissive?: string; emissiveIntensity?: number }>;
  /** Which model to show when there is no file or it fails to load. */
  fallbackModel: "procedural";
  /** Where the file came from and under which license — required before shipping a model. */
  license?: string;
  /** True only for a model of this exact product; generic models must not claim to be exact. */
  exactProduct?: boolean;
}

/**
 * Registered assets, keyed by component id (exact product) or "category:chip/line" (generic).
 * EMPTY: no licensed GLB files are bundled in this repository, so every part uses the procedural
 * fallback and no network requests are made. Add entries only for files with a verified license.
 */
export const MODEL_ASSETS: Record<string, ModelAsset> = {};

/**
 * Categories whose single-object model can be replaced by a GLB. RAM kits, fan packs and coolers
 * (with an AIO radiator placed separately) are multi-part and stay procedural for now.
 */
export const GLB_CATEGORIES: readonly ComponentCategory[] = ["case", "motherboard", "cpu", "gpu", "storage", "psu"];

export function supportsAsset(category: ComponentCategory) {
  return GLB_CATEGORIES.includes(category);
}

/** Registry keys tried for a component, most specific first. */
export function assetKeysFor(component: HardwareComponent): string[] {
  if (component.category === "gpu") return [component.id, `gpu:${component.chip}`, `gpu:${component.line}`];
  return [component.id, `${component.category}:generic`];
}

/**
 * The asset for a component. `extra` (temporary previews from Studio) is checked before the
 * bundled registry; categories without GLB support always return undefined.
 */
export function assetFor(component: HardwareComponent, extra?: Record<string, ModelAsset>): ModelAsset | undefined {
  if (!supportsAsset(component.category)) return undefined;
  for (const key of assetKeysFor(component)) {
    const hit = extra?.[key] ?? MODEL_ASSETS[key];
    if (hit) return hit;
  }
  return undefined;
}
