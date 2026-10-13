import type { Object3D } from "three";

/**
 * Shared between the lazy-loaded 3D scene (anchors) and the DOM overlay (elements).
 * Type-only three import keeps this module out of the 3D bundle.
 */
export const labelAnchors = new Map<string, Object3D>();
export const labelElements = new Map<string, HTMLElement>();
