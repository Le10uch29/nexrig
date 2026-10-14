"use client";

import { useGLTF } from "@react-three/drei";
import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import type { ModelAsset } from "@/features/models/registry";

class AssetErrorBoundary extends Component<{ fallback: ReactNode; url: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn(`[models] ${this.props.url} не загрузилась — показана процедурная модель.`, error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Loads a GLB once (drei caches by URL), clones it per instance and applies the asset's transform. */
function GltfInstance({ asset }: { asset: ModelAsset & { modelUrl: string } }) {
  const { scene } = useGLTF(asset.modelUrl);
  const instance = useMemo(() => {
    const root = scene.clone(true);
    const owned: THREE.Material[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = mats.map((m) => {
        const o2 = asset.materialOverrides?.[m.name];
        if (!o2) return m;
        // Clone only overridden materials so the cached original stays untouched.
        const c = (m as THREE.MeshStandardMaterial).clone();
        if (o2.color) c.color.set(o2.color);
        if (o2.metalness !== undefined) c.metalness = o2.metalness;
        if (o2.roughness !== undefined) c.roughness = o2.roughness;
        if (o2.emissive) c.emissive.set(o2.emissive);
        if (o2.emissiveIntensity !== undefined) c.emissiveIntensity = o2.emissiveIntensity;
        owned.push(c);
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });
    return { root, owned };
  }, [scene, asset.materialOverrides]);

  // Geometry and textures belong to the shared cache; only per-instance materials are disposed.
  useEffect(() => () => instance.owned.forEach((m) => m.dispose()), [instance]);

  const s = asset.scale ?? 1;
  return (
    <group position={asset.anchorOffset} rotation={asset.rotation} scale={typeof s === "number" ? [s, s, s] : s}>
      <primitive object={instance.root} />
    </group>
  );
}

/** GLB when the asset has a file; the procedural fallback while loading, on error, or without a file. */
export function AssetModel({ asset, fallback }: { asset: ModelAsset | undefined; fallback: ReactNode }) {
  if (!asset?.modelUrl) return <>{fallback}</>;
  const withUrl = asset as ModelAsset & { modelUrl: string };
  return (
    <AssetErrorBoundary fallback={fallback} url={withUrl.modelUrl}>
      <Suspense fallback={fallback}>
        <GltfInstance asset={withUrl} />
      </Suspense>
    </AssetErrorBoundary>
  );
}
