"use client";

import { ContactShadows, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import * as THREE from "three";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { caseGeometry } from "@/features/installation/layout";
import type { SlotKey } from "@/features/installation/placement";
import { LabelAnchor, LabelProjector } from "./labels";
import { CaseModel } from "./models";
import { Workshop } from "./Workshop";
import { SlotRenderer } from "./SlotRenderer";

const FIXED_SLOTS: SlotKey[] = ["motherboard", "psu", "cpu", "ram", "cooler", "gpu", "fans"];

interface Framing {
  position: THREE.Vector3;
  target: THREE.Vector3;
  distance: number;
}

function useFraming(): Framing {
  const pcCase = useBuildDerived().resolved.case;
  const size = useThree((s) => s.size);
  // Before the canvas is measured, assume a landscape viewport.
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 1.6;
  const narrow = aspect < 1;
  return useMemo(() => {
    const g = pcCase ? caseGeometry(pcCase) : { depth: 4.4, height: 4.6 };
    // Wide viewports frame the case plus the assembly bench; portrait viewports frame the case and pull back.
    const target = narrow ? new THREE.Vector3(g.depth * 0.3, g.height * 0.45, 0.2) : new THREE.Vector3(g.depth / 2 + 0.4, g.height * 0.42, 0.3);
    const distance = narrow ? 15.5 * Math.min(1.8, 1.05 / aspect) : 15.5;
    const position = target.clone().add(new THREE.Vector3(1.2, g.height * 0.3 + 1.2, distance));
    return { position, target, distance };
  }, [pcCase, narrow, aspect]);
}

function CameraRig({ framing, reducedMotion }: { framing: Framing; reducedMotion: boolean }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const cameraNonce = useBuildStore((s) => s.cameraNonce);
  /** Once the user orbits/zooms, automatic re-framing (resize, case swap) stops. */
  const userMoved = useRef(false);

  useEffect(() => {
    if (userMoved.current) return;
    camera.position.copy(framing.position);
    controls.current?.target.copy(framing.target);
    controls.current?.update();
  }, [camera, framing]);

  useEffect(() => {
    if (!cameraNonce || !controls.current) return;
    const c = controls.current;
    const d = reducedMotion ? 0 : 0.9;
    gsap.to(camera.position, { x: framing.position.x, y: framing.position.y, z: framing.position.z, duration: d, ease: "power2.inOut", onUpdate: () => c.update() });
    gsap.to(c.target, { x: framing.target.x, y: framing.target.y, z: framing.target.z, duration: d, ease: "power2.inOut", onUpdate: () => c.update() });
  }, [cameraNonce, camera, framing, reducedMotion]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      onStart={() => {
        userMoved.current = true;
      }}
      enableDamping
      dampingFactor={0.08}
      minDistance={2.5}
      maxDistance={32}
      maxPolarAngle={Math.PI * 0.49}
      target={framing.target}
    />
  );
}

function Bench({ caseDepth }: { caseDepth: number }) {
  const x = caseDepth / 2 + 1.1;
  return (
    <group position={[x + 1.8, 0.002, 0.2]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.6, 5.6]} />
        {/* anti-static assembly mat */}
        <meshStandardMaterial color="#1f4a5a" roughness={0.9} />
      </mesh>
      <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(4.6, 5.6)]} />
        <lineBasicMaterial color="#5f9fb0" />
      </lineSegments>
      <LabelAnchor id="bench" position={[-1.6, 0.02, -2.6]} />
    </group>
  );
}

function SceneContents({ reducedMotion }: { reducedMotion: boolean }) {
  const { placements, resolved } = useBuildDerived();
  const caseMode = useBuildStore((s) => s.view.caseMode);
  const exploded = useBuildStore((s) => s.view.exploded);
  const framing = useFraming();
  const byKey = useMemo(() => new Map(placements.map((p) => [p.key, p])), [placements]);
  const storage = placements.filter((p) => p.category === "storage");
  const caseDepth = resolved.case ? caseGeometry(resolved.case).depth : 4.4;
  const caseHeight = resolved.case ? caseGeometry(resolved.case).height : 4.6;

  return (
    <>
      <color attach="background" args={["#141010"]} />
      <fog attach="fog" args={["#141010", framing.distance + 6, framing.distance + 34]} />
      {/* Workshop lighting: warm lamp over the bench, soft fill, cool rim from the "window" side. */}
      <hemisphereLight args={["#ffe9cc", "#2a1f18", 0.85]} />
      <spotLight position={[caseDepth / 2 + 1, 9, 1]} angle={0.75} penumbra={0.7} intensity={180} distance={26} decay={2} color="#ffd9a0" />
      <directionalLight position={[2, 4, 14]} intensity={1.0} color="#fff3e2" />
      <directionalLight position={[-9, 6, 3]} intensity={0.55} color="#9fb4ff" />
      <pointLight position={[0.2, caseHeight - 0.6, 0.4]} intensity={4} distance={5} color="#a99bff" />
      <pointLight position={[caseDepth / 2 - 0.5, 1.4, 0.2]} intensity={2} distance={3.5} color="#4fd1e3" />

      <Workshop benchCenterX={caseDepth / 2 + 0.6} />
      <ContactShadows position={[2.5, 0.005, 0]} scale={16} blur={2.4} opacity={0.6} far={6} resolution={512} frames={reducedMotion ? 1 : Infinity} />
      <Bench caseDepth={caseDepth} />

      {resolved.case && <CaseModel key={resolved.case.id} spec={resolved.case} mode={exploded ? "open" : caseMode} />}
      {FIXED_SLOTS.map((k) => (
        <SlotRenderer key={k} slotKey={k} placement={byKey.get(k)} reducedMotion={reducedMotion} />
      ))}
      {storage.map((p) => (
        <SlotRenderer key={p.key} slotKey={p.key} placement={p} reducedMotion={reducedMotion} />
      ))}
      <CameraRig framing={framing} reducedMotion={reducedMotion} />
      <LabelProjector />
    </>
  );
}

export default function PcScene({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const [dpr, setDpr] = useState(1.5);
  const selectSlot = useBuildStore((s) => s.selectSlot);
  return (
    <Canvas
      dpr={dpr}
      frameloop={active ? "always" : "never"}
      camera={{ fov: 34, near: 0.1, far: 120, position: [8, 5, 12] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.4;
      }}
      onPointerMissed={() => selectSlot(null)}
      aria-label="Интерактивная 3D-сцена сборки"
    >
      <PerformanceMonitor onIncline={() => setDpr(Math.min(2, window.devicePixelRatio))} onDecline={() => setDpr(1)} flipflops={3} onFallback={() => setDpr(1)} />
      <SceneContents reducedMotion={reducedMotion} />
    </Canvas>
  );
}
