"use client";

/**
 * 3D side of the scene labels. Labels are plain DOM outside the <Canvas> (see SceneLabels.tsx),
 * positioned every frame by projecting these anchors. This replaces drei <Html>, which mounts a
 * React root per label and unmounts it during the R3F commit
 * ("Attempted to synchronously unmount a root while React was already rendering").
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { labelAnchors, labelElements } from "./label-registry";

/** Marks the 3D point that the DOM label with the same id follows. */
export function LabelAnchor({ id, position }: { id: string; position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    const obj = ref.current;
    if (!obj) return;
    labelAnchors.set(id, obj);
    return () => {
      if (labelAnchors.get(id) === obj) labelAnchors.delete(id);
    };
  }, [id]);
  return <group ref={ref} position={position} />;
}

const tmp = new THREE.Vector3();

/** Writes screen positions straight to the DOM each frame (no React re-render). */
export function LabelProjector() {
  useFrame(({ camera, size }) => {
    for (const [id, el] of labelElements) {
      const obj = labelAnchors.get(id);
      if (!obj) {
        el.style.visibility = "hidden";
        continue;
      }
      obj.getWorldPosition(tmp).project(camera);
      const x = (tmp.x * 0.5 + 0.5) * size.width;
      const y = (-tmp.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.style.visibility = tmp.z > 1 ? "hidden" : "visible";
    }
  });
  return null;
}
