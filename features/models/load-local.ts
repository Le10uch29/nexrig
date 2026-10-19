"use client";

import { Box3, LoadingManager, type Mesh, type Object3D } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { disposeObject } from "./dispose";
import { assertSupported, classifyFiles, externalDependencies, glbJson, ModelImportError, parseGltfJson, resolveDependencies, type ModelKind } from "./import";
import { isUsableBounds, type Bounds } from "./transform";

export interface LoadedModel {
  scene: Object3D;
  fileName: string;
  kind: ModelKind;
  /** Every file that took part in the import (model + dependencies). */
  files: string[];
  bytes: number;
  /** Bounds in the file's own units with the root at identity. */
  bounds: Bounds;
  stats: { meshes: number; triangles: number; materials: number; textures: number };
  /** Non-fatal problems (e.g. a texture that failed to decode). */
  warnings: string[];
  /** The original file when it is a GLB with no external references — usable as-is. */
  standaloneGlb: File | null;
}

const filePath = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;

/**
 * Loads a .glb, or a .gltf with its .bin/texture files, entirely from local files: external
 * references are resolved to blob URLs of the selected files and nothing is fetched from the network.
 * Throws ModelImportError with a user-facing message on any problem.
 */
export async function loadLocalModel(selected: File[]): Promise<LoadedModel> {
  const files = selected.map((f) => Object.assign(f, { path: filePath(f) }));
  const { main, kind, others } = classifyFiles(files);
  const raw = await main.arrayBuffer();
  const json = kind === "glb" ? glbJson(new Uint8Array(raw)) : parseGltfJson(new TextDecoder().decode(raw));
  assertSupported(json);
  const deps = externalDependencies(json);
  const resolved = resolveDependencies(deps, others);

  // Dependency URI → blob URL. GLTFLoader requests URIs as written (possibly percent-encoded).
  const blobUrls = new Map<string, string>();
  for (const [uri, file] of resolved) blobUrls.set(uri.toLowerCase(), URL.createObjectURL(file));
  const failed: string[] = [];
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith("data:") || url.startsWith("blob:")) return url;
    let key = url;
    try {
      key = decodeURIComponent(url);
    } catch {
      // keep as requested
    }
    key = key.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
    const hit = blobUrls.get(key) ?? [...blobUrls.entries()].find(([k]) => key.endsWith(`/${k}`) || k.endsWith(`/${key}`))?.[1];
    // Unknown references never go to the network.
    return hit ?? "data:application/octet-stream;base64,";
  });
  manager.onError = (url) => failed.push(url);

  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  let scene: Object3D;
  try {
    const gltf = await loader.parseAsync(kind === "glb" ? raw : new TextDecoder().decode(raw), "");
    scene = gltf.scene;
  } catch (e) {
    throw new ModelImportError("parse-failed", "Не удалось разобрать модель. Файл повреждён или содержит неподдерживаемые данные.", [e instanceof Error ? e.message : String(e)]);
  } finally {
    blobUrls.forEach((u) => URL.revokeObjectURL(u));
  }

  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  const bounds: Bounds = { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] };
  if (box.isEmpty() || !isUsableBounds(bounds)) {
    disposeObject(scene);
    throw new ModelImportError("parse-failed", "В модели нет видимой геометрии — показывать нечего.");
  }

  let meshes = 0;
  let triangles = 0;
  const materials = new Set<unknown>();
  scene.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    triangles += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => materials.add(x));
  });
  const textures = new Set<unknown>();
  materials.forEach((m) => Object.values(m as object).forEach((v) => v && typeof v === "object" && (v as { isTexture?: boolean }).isTexture && textures.add(v)));

  return {
    scene,
    fileName: main.name,
    kind,
    files: [main.path, ...[...resolved.values()].map((f) => f.path)],
    bytes: main.size + [...resolved.values()].reduce((s, f) => s + f.size, 0),
    bounds,
    stats: { meshes, triangles: Math.round(triangles), materials: materials.size, textures: textures.size },
    warnings: failed.length ? [`Не загрузились файлы: ${[...new Set(failed)].map((u) => (u.startsWith("data:") ? "внешняя ссылка" : u)).join(", ")}. Модель показана без них.`] : [],
    standaloneGlb: kind === "glb" && deps.length === 0 ? main : null,
  };
}

/** One self-contained GLB for a model (used to hand a .gltf + files over to /builder as a single blob). */
export async function toGlbBlob(scene: Object3D): Promise<Blob> {
  const out = await new GLTFExporter().parseAsync(scene, { binary: true });
  return new Blob([out as ArrayBuffer], { type: "model/gltf-binary" });
}
