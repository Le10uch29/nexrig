"use client";

import { useGLTF } from "@react-three/drei";
import { create } from "zustand";
import type { ModelAsset } from "./registry";

/**
 * Temporary GLB previews in /builder, attached explicitly from Studio. Not persisted: the model
 * lives in a blob URL of this tab and disappears on reload. Nothing is replaced automatically —
 * a preview applies only to the component it was attached to.
 */
export interface ModelPreview {
  /** Registry key (component id) the preview applies to. */
  key: string;
  componentName: string;
  fileName: string;
  asset: ModelAsset & { modelUrl: string };
}

interface PreviewState {
  previews: Record<string, ModelPreview>;
  /** Registry-shaped view for assetFor(). */
  assets: Record<string, ModelAsset>;
  attach: (p: ModelPreview) => void;
  detach: (key: string) => void;
  clear: () => void;
}

function release(p: ModelPreview | undefined) {
  if (!p) return;
  useGLTF.clear(p.asset.modelUrl);
  URL.revokeObjectURL(p.asset.modelUrl);
}

const assetsOf = (previews: Record<string, ModelPreview>) => Object.fromEntries(Object.entries(previews).map(([k, p]) => [k, p.asset]));

export const useModelPreviews = create<PreviewState>((set, get) => ({
  previews: {},
  assets: {},
  attach: (p) => {
    const prev = get().previews[p.key];
    if (prev && prev.asset.modelUrl !== p.asset.modelUrl) release(prev);
    const previews = { ...get().previews, [p.key]: p };
    set({ previews, assets: assetsOf(previews) });
  },
  detach: (key) => {
    release(get().previews[key]);
    const previews = { ...get().previews };
    delete previews[key];
    set({ previews, assets: assetsOf(previews) });
  },
  clear: () => {
    Object.values(get().previews).forEach(release);
    set({ previews: {}, assets: {} });
  },
}));
