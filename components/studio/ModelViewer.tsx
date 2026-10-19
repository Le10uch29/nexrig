"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from "react";
import * as THREE from "three";
import type { LoadedModel } from "@/features/models/load-local";
import { boundsCenter, boundsSize, pivotOffset, transformedBounds, type Bounds, type ModelTransform, type Vec3 } from "@/features/models/transform";
import type { HardwareComponent } from "@/types/hardware";
import { CaseModel, CpuModel, GpuModel, MotherboardModel, PsuModel, StorageModel } from "@/components/builder/scene/models";
import { Studio } from "@/components/builder/scene/Studio";

/** Top of the Studio podium; content is lifted so its lowest point stands on it. */
const PODIUM_TOP = 0.125;

/** The procedural model a GLB will replace, drawn in its own local frame (the slot frame in /builder). */
function ReferenceModel({ component }: { component: HardwareComponent }) {
  switch (component.category) {
    case "case":
      return <CaseModel spec={component} mode="glass" />;
    case "motherboard":
      return <MotherboardModel spec={component} />;
    case "cpu":
      return <CpuModel spec={component} />;
    case "gpu":
      return <GpuModel spec={component} spin={false} />;
    case "storage":
      return <StorageModel spec={component} />;
    case "psu":
      return <PsuModel spec={component} />;
    default:
      return null;
  }
}

function BoxEdges({ bounds, color }: { bounds: Bounds; color: string }) {
  const size = boundsSize(bounds);
  const geom = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(Math.max(size[0], 1e-4), Math.max(size[1], 1e-4), Math.max(size[2], 1e-4))), [size[0], size[1], size[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <lineSegments geometry={geom} position={boundsCenter(bounds)}>
      <lineBasicMaterial color={color} transparent opacity={0.85} />
    </lineSegments>
  );
}

function union(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return { min: a.min.map((v, i) => Math.min(v, b.min[i])) as Vec3, max: a.max.map((v, i) => Math.max(v, b.max[i])) as Vec3 };
}

function ViewerContents({ model, transform, reference, showReference, showBounds, cameraNonce, referenceBounds, onReferenceBounds }: ModelViewerProps) {
  const content = useRef<THREE.Group>(null);
  const refGroup = useRef<THREE.Group>(null);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);

  // Measure the reference model once per component, in content-local coordinates.
  useLayoutEffect(() => {
    const g = refGroup.current;
    const c = content.current;
    if (!reference || !g || !c) {
      onReferenceBounds(null);
      return;
    }
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g).applyMatrix4(c.matrixWorld.clone().invert());
    onReferenceBounds(box.isEmpty() ? null : { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference?.id]);

  const modelBounds = model ? transformedBounds(transform, model.bounds) : null;
  // Empty stage: frame a model-sized volume so the podium does not fill the view.
  const all = union(modelBounds, reference && showReference ? referenceBounds : null) ?? { min: [-2.5, 0, -2.5], max: [2.5, 4, 2.5] };
  const lift = PODIUM_TOP - all.min[1];
  const rad = transform.rotationDeg.map((d) => (d * Math.PI) / 180) as Vec3;

  // Frame the content: on load, when the reference changes and on "reset camera".
  // The reference is measured after mounting, so its bounds are part of the key.
  const frameKey = `${model?.fileName ?? ""}|${reference?.id ?? ""}|${referenceBounds?.max.join(",") ?? ""}|${cameraNonce}`;
  useEffect(() => {
    const c = controls.current;
    const size = boundsSize(all);
    const center = boundsCenter(all);
    const target = new THREE.Vector3(center[0], center[1] + lift, center[2]);
    const dist = Math.max(4, Math.max(...size) * 2.4);
    camera.position.set(target.x + dist * 0.45, target.y + dist * 0.3, target.z + dist);
    c?.target.copy(target);
    c?.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  return (
    <>
      <color attach="background" args={["#0b0c12"]} />
      <fog attach="fog" args={["#0b0c12", 26, 60]} />
      <Studio radius={Math.max(2.2, Math.max(boundsSize(all)[0], boundsSize(all)[2]) * 0.62 + 0.4)} animate />
      <group ref={content} position={[0, lift, 0]}>
        {reference && (
          <group ref={refGroup} visible={showReference}>
            <ReferenceModel component={reference} />
          </group>
        )}
        {reference && showReference && referenceBounds && showBounds && <BoxEdges bounds={referenceBounds} color="#4fd1e3" />}
        {model && (
          <>
            <group position={transform.position} rotation={rad} scale={transform.scale}>
              <group position={pivotOffset(model.bounds, transform.pivot)}>
                {/* Owned by Studio and disposed there (disposeObject) — not by the renderer. */}
                <primitive object={model.scene} dispose={null} />
              </group>
            </group>
            {showBounds && modelBounds && <BoxEdges bounds={modelBounds} color="#8d7dff" />}
            {/* pivot: where the model's position is measured from */}
            <axesHelper args={[Math.max(0.4, Math.max(...boundsSize(modelBounds!)) * 0.25)]} position={transform.position} />
          </>
        )}
      </group>
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} minDistance={0.5} maxDistance={80} maxPolarAngle={Math.PI * 0.495} />
    </>
  );
}

export interface ModelViewerProps {
  model: LoadedModel | null;
  transform: ModelTransform;
  reference: HardwareComponent | undefined;
  showReference: boolean;
  showBounds: boolean;
  cameraNonce: number;
  referenceBounds: Bounds | null;
  onReferenceBounds: (b: Bounds | null) => void;
}

/** 3D preview of an imported model on the Studio podium, optionally over the part it replaces. */
export default function ModelViewer(props: ModelViewerProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 34, near: 0.01, far: 200, position: [6, 4, 10] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
      aria-label="3D-просмотр импортированной модели"
    >
      <ViewerContents {...props} />
    </Canvas>
  );
}
