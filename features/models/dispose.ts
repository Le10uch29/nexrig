import type { BufferGeometry, Material, Object3D, Texture } from "three";

function isTexture(v: unknown): v is Texture {
  return Boolean(v && typeof v === "object" && (v as Texture).isTexture);
}

/**
 * Frees the GPU resources of a model the caller owns (a parsed import, not a cached/shared one):
 * geometries, materials and every texture referenced by those materials. Each is disposed once.
 * Returns the counts — useful for tests and for checking that nothing was skipped.
 */
export function disposeObject(root: Object3D) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((o) => {
    const mesh = o as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
  });
  for (const m of materials)
    for (const value of Object.values(m)) {
      if (isTexture(value)) textures.add(value);
    }
  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => {
    // Image bitmaps decoded by GLTFLoader hold memory until closed.
    const img = t.image as { close?: () => void } | undefined;
    t.dispose();
    if (img && typeof img.close === "function") img.close();
  });
  materials.forEach((m) => m.dispose());
  root.removeFromParent();
  return { geometries: geometries.size, materials: materials.size, textures: textures.size };
}
