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
    // The case is the hero: framed large, slightly left of centre so the assembly mat stays in view.
    // Portrait viewports frame the case alone and pull back.
    // Landscape: pulled back enough to show the workshop shelves behind the case; squarer panels pull back a bit more.
    const target = narrow ? new THREE.Vector3(g.depth * 0.25, g.height * 0.47, 0.2) : new THREE.Vector3(g.depth * 0.3, g.height * 0.55, 0.3);
    const distance = narrow ? 12.5 * Math.min(1.9, 1.1 / aspect) : 14.5 * Math.min(1.2, Math.max(1, 1.4 / aspect));
    const position = target.clone().add(new THREE.Vector3(1.8, g.height * 0.22 + 0.9, distance));
    return { position, target, distance };
  }, [pcCase, narrow, aspect]);
}

function CameraRig({ framing, reducedMotion }: { framing: Framing; reducedMotion: boolean }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const cameraNonce = useBuildStore((s) => s.cameraNonce);
  /** Once the user orbits/zooms, automatic re-framing (resize, case swap) stops. */
  const userMoved = useRef(false);

  /** First framing is applied instantly; later re-framing (panel resize, case swap) eases in. */
  const framed = useRef(false);
  useEffect(() => {
    if (userMoved.current) return;
    const c = controls.current;
    if (!framed.current || reducedMotion || !c) {
      camera.position.copy(framing.position);
      c?.target.copy(framing.target);
      c?.update();
      framed.current = true;
      return;
    }
    const tweens = [
      gsap.to(camera.position, { x: framing.position.x, y: framing.position.y, z: framing.position.z, duration: 0.45, ease: "power2.out", onUpdate: () => c.update() }),
      gsap.to(c.target, { x: framing.target.x, y: framing.target.y, z: framing.target.z, duration: 0.45, ease: "power2.out", onUpdate: () => c.update() }),
    ];
    return () => tweens.forEach((tw) => tw.kill());
  }, [camera, framing, reducedMotion]);

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
        <meshStandardMaterial color="#1a2330" roughness={0.85} />
      </mesh>
      <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(4.6, 5.6)]} />
        <lineBasicMaterial color="#35506a" />
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
      <color attach="background" args={["#0f0d0c"]} />
      <fog attach="fog" args={["#0f0d0c", framing.distance + 10, framing.distance + 40]} />
      {/* Studio lighting: soft key from front-right, cool fill from the left, rim from behind. */}
      <hemisphereLight args={["#e8ecff", "#1a1d24", 0.95]} />
      <directionalLight position={[6, 9, 10]} intensity={2.4} color="#ffffff" />
      <directionalLight position={[-8, 4, 6]} intensity={0.6} color="#b9c6ff" />
      <directionalLight position={[2, 6, -9]} intensity={0.9} color="#c9bfff" />
      {/* Interior fill so parts inside the case keep their contrast through the glass. */}
      <pointLight position={[0.2, caseHeight - 0.6, 0.4]} intensity={7} distance={6} color="#d9d4ff" />
      <pointLight position={[caseDepth / 2 - 0.5, 1.4, 0.2]} intensity={3} distance={4.5} color="#cfeff5" />

      <Workshop centerX={caseDepth / 2 + 0.6} animate={!reducedMotion} />
      <ContactShadows position={[2.5, 0.005, 0]} scale={16} blur={2.6} opacity={0.7} far={6} resolution={512} frames={reducedMotion ? 1 : Infinity} />
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
        gl.toneMappingExposure = 1.15;
      }}
      onPointerMissed={() => selectSlot(null)}
      aria-label="Интерактивная 3D-сцена сборки"
    >
      <PerformanceMonitor onIncline={() => setDpr(Math.min(2, window.devicePixelRatio))} onDecline={() => setDpr(1)} flipflops={3} onFallback={() => setDpr(1)} />
      <SceneContents reducedMotion={reducedMotion} />
    </Canvas>
  );
}
