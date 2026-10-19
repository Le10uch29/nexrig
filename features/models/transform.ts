import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { ModelAsset } from "./registry";

/**
 * Transform of an imported model and its conversion to a registry entry (features/models/registry.ts).
 * Pure math — unit-tested. Scene units: 1 = 100 mm, the same as the procedural models.
 */

export type Vec3 = [number, number, number];

/** Which point of the model is placed at its position: the file's own origin, the box centre or the bottom centre. */
export type Pivot = "origin" | "center" | "bottom";

export const PIVOT_LABEL: Record<Pivot, string> = { origin: "Начало координат файла", center: "Центр габаритов", bottom: "Центр основания" };

export interface ModelTransform {
  position: Vec3;
  /** Euler XYZ in degrees (radians in the exported asset). */
  rotationDeg: Vec3;
  /** Uniform scale. */
  scale: number;
  pivot: Pivot;
}

/** Axis-aligned bounds of the model in the file's own units. */
export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export const SCALE_MIN = 0.0001;
export const SCALE_MAX = 10000;

export const IDENTITY_TRANSFORM: ModelTransform = { position: [0, 0, 0], rotationDeg: [0, 0, 0], scale: 1, pivot: "origin" };

const finite = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);
const round = (n: number, digits = 4) => {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return Object.is(r, -0) ? 0 : r;
};
const round3 = (v: Vec3, digits = 4): Vec3 => [round(v[0], digits), round(v[1], digits), round(v[2], digits)];

/** Angle in (-180, 180]. */
export function wrapDegrees(d: number) {
  const r = ((((d + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
}

/** Repairs user input: finite numbers, scale within limits, angles wrapped. */
export function normalizeTransform(t: ModelTransform): ModelTransform {
  return {
    position: t.position.map((v) => finite(v, 0)) as Vec3,
    rotationDeg: t.rotationDeg.map((v) => wrapDegrees(finite(v, 0))) as Vec3,
    scale: Math.min(SCALE_MAX, Math.max(SCALE_MIN, finite(t.scale, 1) || 1)),
    pivot: t.pivot === "center" || t.pivot === "bottom" ? t.pivot : "origin",
  };
}

export function boundsSize(b: Bounds): Vec3 {
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
}

export function boundsCenter(b: Bounds): Vec3 {
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
}

/** True when the box has at least one non-zero, finite dimension. */
export function isUsableBounds(b: Bounds) {
  const s = boundsSize(b);
  return s.every((v) => Number.isFinite(v) && v >= 0) && Math.max(...s) > 0;
}

/** Offset that moves the chosen pivot point of the raw model to its local origin. */
export function pivotOffset(b: Bounds, pivot: Pivot): Vec3 {
  if (pivot === "origin") return [0, 0, 0];
  const c = boundsCenter(b);
  return pivot === "center" ? [-c[0], -c[1], -c[2]] : [-c[0], -b.min[1], -c[2]];
}

/**
 * Starting transform after loading ("reset" returns here).
 * With a reference (the procedural model the file should replace): centred on it and scaled to
 * its largest dimension. Without one: standing on the floor, scaled to `fallbackSize`.
 */
export function fitTransform(b: Bounds, reference?: Bounds, fallbackSize = 4): ModelTransform {
  const size = Math.max(...boundsSize(b));
  if (!(size > 0) || !Number.isFinite(size)) return { ...IDENTITY_TRANSFORM };
  if (reference && isUsableBounds(reference)) {
    const scale = Math.max(...boundsSize(reference)) / size;
    return normalizeTransform({ position: round3(boundsCenter(reference)), rotationDeg: [0, 0, 0], scale: round(scale, 6), pivot: "center" });
  }
  return normalizeTransform({ position: [0, 0, 0], rotationDeg: [0, 0, 0], scale: round(fallbackSize / size, 6), pivot: "bottom" });
}

/** position · rotation · scale · pivot offset — the full transform of the raw model. */
export function modelMatrix(t: ModelTransform, b: Bounds): Matrix4 {
  const n = normalizeTransform(t);
  const q = new Quaternion().setFromEuler(new Euler(...(n.rotationDeg.map((d) => (d * Math.PI) / 180) as Vec3), "XYZ"));
  const trs = new Matrix4().compose(new Vector3(...n.position), q, new Vector3(n.scale, n.scale, n.scale));
  return trs.multiply(new Matrix4().makeTranslation(...pivotOffset(b, n.pivot)));
}

/** Bounds of the model after the transform (all eight corners transformed). */
export function transformedBounds(t: ModelTransform, b: Bounds): Bounds {
  const m = modelMatrix(t, b);
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const x of [b.min[0], b.max[0]])
    for (const y of [b.min[1], b.max[1]])
      for (const z of [b.min[2], b.max[2]]) {
        const p = new Vector3(x, y, z).applyMatrix4(m);
        min.min(p);
        max.max(p);
      }
  return { min: [min.x, min.y, min.z], max: [max.x, max.y, max.z] };
}

/**
 * Registry form of the transform. The registry has no pivot, so the pivot offset is folded into
 * `anchorOffset`: anchor = position + R·S·pivot. Rendering through AssetModel gives the same placement.
 */
export function toModelAsset(t: ModelTransform, b: Bounds, modelUrl?: string): ModelAsset {
  const n = normalizeTransform(t);
  const q = new Quaternion().setFromEuler(new Euler(...(n.rotationDeg.map((d) => (d * Math.PI) / 180) as Vec3), "XYZ"));
  const folded = new Vector3(...pivotOffset(b, n.pivot)).multiplyScalar(n.scale).applyQuaternion(q).add(new Vector3(...n.position));
  const tb = transformedBounds(n, b);
  return {
    ...(modelUrl ? { modelUrl } : {}),
    scale: round(n.scale, 6),
    rotation: round3(n.rotationDeg.map((d) => (d * Math.PI) / 180) as Vec3, 6),
    anchorOffset: round3([folded.x, folded.y, folded.z]),
    boundingBox: { center: round3(boundsCenter(tb)), size: round3(boundsSize(tb)) },
    fallbackModel: "procedural",
  };
}

/** A path for the registry must point to a file served from /public/models. */
export function validatePublicModelPath(p: string): string | null {
  const v = p.trim();
  if (!v) return "Укажите путь к файлу.";
  if (!v.startsWith("/models/")) return "Путь должен начинаться с /models/ — файлы моделей лежат в public/models.";
  if (!/\.(glb|gltf)$/i.test(v)) return "Путь должен вести к файлу .glb или .gltf.";
  if (/\.\.|\\|\s/.test(v)) return "В пути не должно быть «..», обратных слэшей и пробелов.";
  return null;
}

export interface ModelExport {
  format: "nexrig.model-asset.v1";
  exportedAt: string;
  source: { fileName: string; kind: "glb" | "gltf"; files: string[]; bytes: number };
  /** Set only after the file was found at this path on the running site; never guessed. */
  modelUrl: string | null;
  note: string;
  /** Where the asset should be registered (component id), when a reference part was chosen. */
  registryKey: string | null;
  reference: { componentId: string; name: string; category: string } | null;
  transform: ModelTransform;
  fileBounds: { size: Vec3; center: Vec3 };
  /** Entry for MODEL_ASSETS in features/models/registry.ts. */
  asset: ModelAsset;
}

export function buildExport(input: {
  source: ModelExport["source"];
  transform: ModelTransform;
  bounds: Bounds;
  verifiedUrl: string | null;
  reference: ModelExport["reference"];
  now?: Date;
}): ModelExport {
  const t = normalizeTransform(input.transform);
  return {
    format: "nexrig.model-asset.v1",
    exportedAt: (input.now ?? new Date()).toISOString(),
    source: input.source,
    modelUrl: input.verifiedUrl,
    note: input.verifiedUrl
      ? "Файл найден по этому пути. Добавьте `asset` в MODEL_ASSETS под ключом registryKey."
      : `Путь к файлу не задан: положите ${input.source.fileName} в public/models/… и проверьте путь в Studio — только тогда он попадёт в экспорт.`,
    registryKey: input.reference?.componentId ?? null,
    reference: input.reference,
    transform: { ...t, position: round3(t.position), rotationDeg: round3(t.rotationDeg, 3), scale: round(t.scale, 6) },
    fileBounds: { size: round3(boundsSize(input.bounds)), center: round3(boundsCenter(input.bounds)) },
    asset: toModelAsset(t, input.bounds, input.verifiedUrl ?? undefined),
  };
}
