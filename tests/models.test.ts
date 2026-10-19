import { BoxGeometry, Euler, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Texture, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { ALL_COMPONENTS } from "@/components/PcComponents";
import { disposeObject } from "@/features/models/dispose";
import {
  checkGlbHeader,
  classifyFiles,
  externalDependencies,
  glbJson,
  MAX_IMPORT_BYTES,
  ModelImportError,
  parseGltfJson,
  resolveDependencies,
  unsupportedExtensions,
  assertSupported,
} from "@/features/models/import";
import { buildInventory, inventoryCsv } from "@/features/models/inventory";
import { assetFor, assetKeysFor, type ModelAsset } from "@/features/models/registry";
import {
  buildExport,
  fitTransform,
  modelMatrix,
  normalizeTransform,
  pivotOffset,
  toModelAsset,
  transformedBounds,
  validatePublicModelPath,
  wrapDegrees,
  type Bounds,
  type ModelTransform,
} from "@/features/models/transform";

const f = (name: string, size = 10, path?: string) => ({ name, size, path });

function glb(json: object): Uint8Array {
  let text = JSON.stringify(json);
  while (text.length % 4) text += " ";
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(20 + body.length);
  const v = new DataView(out.buffer);
  out.set(new TextEncoder().encode("glTF"), 0);
  v.setUint32(4, 2, true);
  v.setUint32(8, out.length, true);
  v.setUint32(12, body.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  out.set(body, 20);
  return out;
}

function expectImportError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ModelImportError);
    expect((e as ModelImportError).code).toBe(code);
    return e as ModelImportError;
  }
  throw new Error(`expected ${code}`);
}

describe("model import: files and dependencies", () => {
  it("picks the single model file and keeps the rest as dependencies", () => {
    const r = classifyFiles([f("scene.bin"), f("Scene.GLTF"), f("albedo.png")]);
    expect(r.main.name).toBe("Scene.GLTF");
    expect(r.kind).toBe("gltf");
    expect(r.others.map((x) => x.name)).toEqual(["scene.bin", "albedo.png"]);
  });

  it("refuses no model, several models, empty and oversized files", () => {
    expectImportError(() => classifyFiles([]), "empty");
    expectImportError(() => classifyFiles([f("a.png")]), "no-model");
    expectImportError(() => classifyFiles([f("a.glb"), f("b.gltf")]), "several-models");
    expectImportError(() => classifyFiles([f("a.glb", 0)]), "empty");
    expectImportError(() => classifyFiles([f("a.glb", MAX_IMPORT_BYTES + 1)]), "too-large");
  });

  it("validates the GLB header and reads its JSON chunk", () => {
    const bytes = glb({ asset: { version: "2.0" }, buffers: [{ byteLength: 4 }] });
    expect(() => checkGlbHeader(bytes)).not.toThrow();
    expect(glbJson(bytes).asset?.version).toBe("2.0");
    expectImportError(() => checkGlbHeader(new TextEncoder().encode("not a glb file at all")), "bad-glb");
    const v1 = glb({ asset: { version: "2.0" } });
    new DataView(v1.buffer).setUint32(4, 1, true);
    expectImportError(() => checkGlbHeader(v1), "not-gltf2");
  });

  it("rejects broken or non-2.0 glTF JSON", () => {
    expectImportError(() => parseGltfJson("{oops"), "bad-json");
    expectImportError(() => parseGltfJson('{"asset":{"version":"1.0"}}'), "not-gltf2");
  });

  it("lists external buffers and images, skipping embedded data URIs", () => {
    const deps = externalDependencies({
      buffers: [{ uri: "scene.bin" }, { uri: "data:application/octet-stream;base64,AAAA" }],
      images: [{ uri: "textures/Base%20Color.png" }, { uri: "./scene.bin" }, { bufferView: 2 }],
    });
    expect(deps).toEqual(["scene.bin", "textures/Base Color.png"]);
  });

  it("resolves dependencies by relative path, then by name", () => {
    const files = [f("scene.bin", 10, "car/scene.bin"), f("Base Color.png", 10, "car/textures/Base Color.png")];
    const map = resolveDependencies(["scene.bin", "textures/Base Color.png"], files);
    expect(map.get("textures/Base Color.png")?.path).toBe("car/textures/Base Color.png");
    expect(resolveDependencies(["tex/a.png"], [f("A.PNG")]).size).toBe(1);
  });

  it("names every missing file instead of loading a partial model", () => {
    const e = expectImportError(() => resolveDependencies(["scene.bin", "tex/a.png", "tex/b.png"], [f("a.png")]), "missing-dependencies");
    expect(e.details).toEqual(["scene.bin", "tex/b.png"]);
    expect(e.message).toMatch(/2 файлов/);
  });

  it("does not fetch remote references", () => {
    const e = expectImportError(() => resolveDependencies(["https://cdn.example.com/a.bin"], []), "missing-dependencies");
    expect(e.details).toEqual(["https://cdn.example.com/a.bin"]);
  });

  it("refuses required extensions it cannot decode, with a hint", () => {
    const json = { asset: { version: "2.0" }, extensionsRequired: ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_transform"] };
    expect(unsupportedExtensions(json)).toEqual(["KHR_draco_mesh_compression"]);
    const e = expectImportError(() => assertSupported(json), "unsupported-extension");
    expect(e.details[0]).toMatch(/Draco/);
    expect(() => assertSupported({ asset: { version: "2.0" }, extensionsUsed: ["KHR_draco_mesh_compression"] })).not.toThrow();
  });
});

const box: Bounds = { min: [-1, 0, -0.5], max: [3, 2, 0.5] }; // 4 × 2 × 1, centre (1, 1, 0)

describe("model transforms", () => {
  it("wraps angles and repairs invalid input", () => {
    expect(wrapDegrees(270)).toBe(-90);
    expect(wrapDegrees(-180)).toBe(180);
    expect(wrapDegrees(540)).toBe(180);
    const n = normalizeTransform({ position: [NaN, 1, Infinity], rotationDeg: [370, 0, 0], scale: 0, pivot: "weird" as never });
    expect(n).toEqual({ position: [0, 1, 0], rotationDeg: [10, 0, 0], scale: 1, pivot: "origin" });
    expect(normalizeTransform({ ...n, scale: 1e9 }).scale).toBe(10000);
    expect(normalizeTransform({ ...n, scale: -5 }).scale).toBe(0.0001);
  });

  it("puts the chosen pivot at the local origin", () => {
    expect(pivotOffset(box, "origin")).toEqual([0, 0, 0]);
    expect(pivotOffset(box, "center")).toEqual([-1, -1, -0]);
    expect(pivotOffset(box, "bottom")).toEqual([-1, -0, -0]);
  });

  it("fits a new model to the floor or to the reference part", () => {
    const floor = fitTransform(box);
    expect(floor).toMatchObject({ pivot: "bottom", position: [0, 0, 0], scale: 1 });
    const ref: Bounds = { min: [0, 0, 0], max: [8, 2, 2] };
    const fitted = fitTransform(box, ref);
    expect(fitted.pivot).toBe("center");
    expect(fitted.scale).toBe(2);
    expect(fitted.position).toEqual([4, 1, 1]);
    const b = transformedBounds(fitted, box);
    expect(b.min).toEqual([0, -1, 0]);
    expect(b.max).toEqual([8, 3, 2]);
  });

  it("computes bounds after rotation", () => {
    const t: ModelTransform = { position: [0, 0, 0], rotationDeg: [0, 90, 0], scale: 1, pivot: "center" };
    const b = transformedBounds(t, box);
    expect(b.max[0] - b.min[0]).toBeCloseTo(1);
    expect(b.max[2] - b.min[2]).toBeCloseTo(4);
  });

  it("folds the pivot into the registry transform without moving the model", () => {
    const t: ModelTransform = { position: [0.5, 1, -2], rotationDeg: [10, 35, -20], scale: 1.7, pivot: "bottom" };
    const asset = toModelAsset(t, box);
    // AssetModel renders: group(position=anchorOffset, rotation, scale) > model.
    const s = asset.scale as number;
    const registry = new Matrix4().compose(new Vector3(...asset.anchorOffset!), new Quaternion().setFromEuler(new Euler(...asset.rotation!)), new Vector3(s, s, s));
    const studio = modelMatrix(t, box);
    for (const p of [new Vector3(...box.min), new Vector3(...box.max), new Vector3(0.3, 1.1, -0.2)]) {
      const a = p.clone().applyMatrix4(registry);
      const b = p.clone().applyMatrix4(studio);
      expect(a.distanceTo(b)).toBeLessThan(1e-3);
    }
    expect(asset.fallbackModel).toBe("procedural");
    expect(asset.modelUrl).toBeUndefined();
  });

  it("accepts only real /models paths", () => {
    expect(validatePublicModelPath("/models/gpu/rtx.glb")).toBeNull();
    expect(validatePublicModelPath("")).toMatch(/Укажите/);
    expect(validatePublicModelPath("models/a.glb")).toMatch(/\/models\//);
    expect(validatePublicModelPath("/models/a.obj")).toMatch(/\.glb/);
    expect(validatePublicModelPath("/models/../secret.glb")).toMatch(/«\.\.»/);
  });

  it("exports a path only when it was verified", () => {
    const base = { source: { fileName: "case.glb", kind: "glb" as const, files: ["case.glb"], bytes: 100 }, transform: fitTransform(box), bounds: box, reference: null, now: new Date("2026-10-18T00:00:00Z") };
    const unverified = buildExport({ ...base, verifiedUrl: null });
    expect(unverified.modelUrl).toBeNull();
    expect(unverified.asset.modelUrl).toBeUndefined();
    expect(unverified.registryKey).toBeNull();
    expect(unverified.note).toMatch(/не задан/);
    const verified = buildExport({ ...base, verifiedUrl: "/models/case.glb", reference: { componentId: "fractal-north", name: "Fractal Design North", category: "case" } });
    expect(verified.modelUrl).toBe("/models/case.glb");
    expect(verified.asset.modelUrl).toBe("/models/case.glb");
    expect(verified.registryKey).toBe("fractal-north");
    expect(verified.fileBounds.size).toEqual([4, 2, 1]);
  });
});

describe("disposing an imported model", () => {
  it("disposes every geometry, material and texture once and closes image bitmaps", () => {
    const close = vi.fn();
    const map = new Texture({ close } as never);
    const shared = new MeshStandardMaterial({ map });
    const g1 = new BoxGeometry();
    const g2 = new BoxGeometry();
    const root = new Group();
    const parent = new Group();
    parent.add(root);
    root.add(new Mesh(g1, shared), new Mesh(g2, [shared, new MeshStandardMaterial()]));
    const spies = [vi.spyOn(g1, "dispose"), vi.spyOn(g2, "dispose"), vi.spyOn(shared, "dispose"), vi.spyOn(map, "dispose")];
    const counts = disposeObject(root);
    expect(counts).toEqual({ geometries: 2, materials: 2, textures: 1 });
    spies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
    expect(close).toHaveBeenCalledTimes(1);
    expect(root.parent).toBeNull();
  });
});

describe("model registry and inventory", () => {
  const gpu = ALL_COMPONENTS.find((c) => c.category === "gpu")!;
  const ram = ALL_COMPONENTS.find((c) => c.category === "ram")!;
  const kase = ALL_COMPONENTS.find((c) => c.category === "case")!;
  const asset: ModelAsset = { modelUrl: "blob:x", fallbackModel: "procedural" };

  it("tries the exact id, then generic keys; previews only apply where asked", () => {
    expect(assetKeysFor(gpu)[0]).toBe(gpu.id);
    expect(assetKeysFor(gpu)[1]).toMatch(/^gpu:/);
    expect(assetFor(gpu)).toBeUndefined();
    expect(assetFor(gpu, { [gpu.id]: asset })).toBe(asset);
    const other = ALL_COMPONENTS.find((c) => c.category === "gpu" && c.id !== gpu.id && c.chip !== (gpu.category === "gpu" ? gpu.chip : ""))!;
    expect(assetFor(other, { [gpu.id]: asset })).toBeUndefined();
    expect(assetFor(kase, { [kase.id]: asset })).toBe(asset);
  });

  it("keeps multi-part categories procedural", () => {
    expect(assetFor(ram, { [ram.id]: asset, "ram:generic": asset })).toBeUndefined();
  });

  it("lists every catalog component with its current model", () => {
    const inv = buildInventory();
    expect(inv.reduce((s, c) => s + c.total, 0)).toBe(ALL_COMPONENTS.length);
    expect(inv.every((c) => c.withGlb === 0 && !c.proceduralRemovable)).toBe(true);
    expect(inv.find((c) => c.category === "ram")!.glbSupported).toBe(false);
    expect(inv.find((c) => c.category === "case")!.items[0].keys).toEqual([kase.id, "case:generic"]);
  });

  it("marks a category removable only when all its parts have a GLB", () => {
    const one = buildInventory(undefined, { [kase.id]: asset }).find((c) => c.category === "case")!;
    expect(one.withGlb).toBe(1);
    expect(one.proceduralRemovable).toBe(false);
    const all = buildInventory(undefined, { "case:generic": asset }).find((c) => c.category === "case")!;
    expect(all.withGlb).toBe(all.total);
    expect(all.proceduralRemovable).toBe(true);
    expect(all.items[0].matchedKey).toBe("case:generic");
  });

  it("exports the inventory as CSV with one row per component", () => {
    const csv = inventoryCsv(buildInventory());
    expect(csv.startsWith("﻿Категория;")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines.length).toBe(ALL_COMPONENTS.length + 1);
  });
});
