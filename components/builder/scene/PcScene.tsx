"use client";

import { ContactShadows, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Canvas, createPortal, useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import * as THREE from "three";
import type { CaseSpec } from "@/types/hardware";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { caseFeet, caseGeometry } from "@/features/installation/layout";
import type { SlotKey } from "@/features/installation/placement";
import { useModelPreviews } from "@/features/models/preview";
import { assetFor } from "@/features/models/registry";
import { AssetModel } from "./AssetModel";
import { LabelAnchor, LabelProjector } from "./labels";
import { CaseModel } from "./models";
import { Workshop } from "./Workshop";
import { SlotRenderer } from "./SlotRenderer";
import { PODIUM_TOP, STUDIO_BACKDROP_URL, StudioLights, StudioSet, StudioStage } from "./Studio";

const FIXED_SLOTS: SlotKey[] = ["motherboard", "psu", "cpu", "ram", "cooler", "gpu", "fans"];

interface Framing {
  position: THREE.Vector3;
  target: THREE.Vector3;
  distance: number;
}

export type SceneEnvironment = "workshop" | "studio";

/** Default case size for framing when no case is selected (and for the studio's fixed set camera). */
const DEFAULT_CASE = { depth: 4.4, height: 4.6 };

/** Camera framing for a case of the given size; `lift` raises the case (podium, feet). */
function framingFor(environment: SceneEnvironment, g: { depth: number; height: number }, aspect: number, lift: number): Framing {
  const narrow = aspect < 1;
  if (environment === "studio") {
    // Showroom: the case stands centred on the podium, seen slightly from above and the front-right.
    // Landscape aims below the case centre so it sits above the choice tray that covers the bottom.
    const target = new THREE.Vector3(0, lift + g.height * (narrow ? 0.45 : 0.2), 0);
    const distance = narrow ? 14 * Math.min(1.9, 1.1 / aspect) : 19 * Math.min(1.25, Math.max(1, 1.5 / aspect));
    const position = target.clone().add(new THREE.Vector3(distance * 0.32, g.height * 0.32 + 0.8, distance));
    return { position, target, distance };
  }
  // The case is the hero: framed large, slightly left of centre so the assembly mat stays in view.
  // Portrait viewports frame the case alone and pull back.
  // Landscape: pulled back enough to show the workshop shelves behind the case; squarer panels pull back a bit more.
  const target = narrow ? new THREE.Vector3(g.depth * 0.25, lift + g.height * 0.47, 0.2) : new THREE.Vector3(g.depth * 0.3, lift + g.height * 0.55, 0.3);
  const distance = narrow ? 12.5 * Math.min(1.9, 1.1 / aspect) : 14.5 * Math.min(1.2, Math.max(1, 1.4 / aspect));
  const position = target.clone().add(new THREE.Vector3(1.8, g.height * 0.22 + 0.9, distance));
  return { position, target, distance };
}

function useAspect() {
  const size = useThree((s) => s.size);
  // Before the canvas is measured, assume a landscape viewport.
  return size.width > 0 && size.height > 0 ? size.width / size.height : 1.6;
}

/** How high the build stands: on the podium in the studio, plus the case's feet. */
function liftFor(environment: SceneEnvironment, pcCase: CaseSpec | undefined) {
  return (environment === "studio" ? PODIUM_TOP : 0) + (pcCase ? caseFeet(pcCase).height : 0);
}

function useFraming(environment: SceneEnvironment): Framing {
  const pcCase = useBuildDerived().resolved.case;
  const aspect = useAspect();
  return useMemo(() => framingFor(environment, pcCase ? caseGeometry(pcCase) : DEFAULT_CASE, aspect, liftFor(environment, pcCase)), [pcCase, aspect, environment]);
}

function placeCamera(camera: THREE.PerspectiveCamera, framing: Framing, aspect: number) {
  camera.aspect = aspect;
  camera.position.copy(framing.position);
  camera.lookAt(framing.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/** Background layer first, then the build over it (depth cleared, so the layers never intersect). */
function renderLayers(gl: THREE.WebGLRenderer, background: THREE.Scene, backgroundCamera: THREE.Camera, main: THREE.Scene, mainCamera: THREE.Camera) {
  gl.autoClear = false;
  gl.clear();
  gl.render(background, backgroundCamera);
  gl.clearDepth();
  gl.render(main, mainCamera);
}

/**
 * Renders its children (backdrop, hall, props) in their own scene with a fixed camera: they stay
 * still while the user turns and zooms the build. Interactive parts stay in the main scene.
 */
function StaticLayer({ children }: { children: React.ReactNode }) {
  const aspect = useAspect();
  const [scene] = useState(() => new THREE.Scene());
  const [camera] = useState(() => new THREE.PerspectiveCamera(34, aspect, 0.1, 120));
  // Fixed framing for a default case, so swapping the case does not move the set either.
  const framing = useMemo(() => framingFor("studio", DEFAULT_CASE, aspect, PODIUM_TOP), [aspect]);
  useLayoutEffect(() => placeCamera(camera, framing, aspect), [camera, framing, aspect]);
  useFrame(({ gl, scene: main, camera: mainCamera }) => renderLayers(gl, scene, camera, main, mainCamera), 1);
  return createPortal(children, scene, { camera });
}

function CameraRig({ framing, reducedMotion, turntable = false }: { framing: Framing; reducedMotion: boolean; turntable?: boolean }) {
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

  // Turntable (studio): the build turns around its vertical axis and zooms; the view height stays
  // close to the default, so the podium keeps standing on the static floor behind it.
  const offset = framing.position.clone().sub(framing.target);
  const polar = Math.acos(offset.y / offset.length());
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      onStart={() => {
        userMoved.current = true;
      }}
      enableDamping
      dampingFactor={0.08}
      enablePan={!turntable}
      minDistance={turntable ? framing.distance * 0.45 : 2.5}
      maxDistance={turntable ? framing.distance * 1.3 : 32}
      minPolarAngle={turntable ? Math.max(0.2, polar - 0.12) : 0}
      maxPolarAngle={turntable ? Math.min(Math.PI * 0.49, polar + 0.12) : Math.PI * 0.49}
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

function SceneContents({ reducedMotion, environment }: { reducedMotion: boolean; environment: SceneEnvironment }) {
  const { placements, resolved } = useBuildDerived();
  const caseMode = useBuildStore((s) => s.view.caseMode);
  const exploded = useBuildStore((s) => s.view.exploded);
  const framing = useFraming(environment);
  const previews = useModelPreviews((s) => s.assets);
  const byKey = useMemo(() => new Map(placements.map((p) => [p.key, p])), [placements]);
  const storage = placements.filter((p) => p.category === "storage");
  const g = resolved.case ? caseGeometry(resolved.case) : { depth: 4.4, height: 4.6, width: 2.2 };
  const caseDepth = g.depth;
  const caseHeight = g.height;
  const studio = environment === "studio";
  const backdropChoice = useBuildStore((s) => s.view.backdrop ?? "photo");
  const backdrop = studio && backdropChoice === "photo" ? STUDIO_BACKDROP_URL : undefined;
  const bg = studio ? "#0b0c12" : "#0f0d0c";
  const lift = liftFor(environment, resolved.case);

  return (
    <>
      {/* Studio: the set is a separate static layer behind the build, so the main scene has no background. */}
      {!studio && <color attach="background" args={[bg]} />}
      <fog attach="fog" args={[bg, framing.distance + (studio ? 4 : 10), framing.distance + (studio ? 28 : 40)]} />
      {studio ? (
        <>
          <StaticLayer>
            {/* A photo backdrop sets the layer's background itself. */}
            {!backdrop && <color attach="background" args={[bg]} />}
            <fog attach="fog" args={[bg, 23, 47]} />
            <StudioSet bright backdrop={backdrop} />
          </StaticLayer>
          <StudioStage radius={Math.max(caseDepth, g.width) * 0.62 + 0.5} animate={!reducedMotion} />
          <StudioLights bright />
          <ContactShadows position={[0, PODIUM_TOP + 0.005, 0]} scale={10} blur={2.2} opacity={0.75} far={5} resolution={512} frames={reducedMotion ? 1 : Infinity} />
        </>
      ) : (
        <>
          {/* Studio lighting: soft key from front-right, cool fill from the left, rim from behind. */}
          <hemisphereLight args={["#e8ecff", "#1a1d24", 0.95]} />
          <directionalLight position={[6, 9, 10]} intensity={2.4} color="#ffffff" />
          <directionalLight position={[-8, 4, 6]} intensity={0.6} color="#b9c6ff" />
          <directionalLight position={[2, 6, -9]} intensity={0.9} color="#c9bfff" />
          <Workshop centerX={caseDepth / 2 + 0.6} animate={!reducedMotion} />
          <ContactShadows position={[2.5, 0.005, 0]} scale={16} blur={2.6} opacity={0.7} far={6} resolution={512} frames={reducedMotion ? 1 : Infinity} />
          <Bench caseDepth={caseDepth} />
        </>
      )}
      {/* The build stands on the case's feet (and on the podium in the studio). */}
      <group position={[0, lift, 0]}>
        {/* Interior fill so parts inside the case keep their contrast through the glass. */}
        <pointLight position={[0.2, caseHeight - 0.6, 0.4]} intensity={7} distance={6} color="#d9d4ff" />
        <pointLight position={[caseDepth / 2 - 0.5, 1.4, 0.2]} intensity={3} distance={4.5} color="#cfeff5" />

        {/* A registered or previewed GLB case has no panel modes; the procedural one keeps solid/glass/open. */}
        {resolved.case && <AssetModel key={resolved.case.id} asset={assetFor(resolved.case, previews)} fallback={<CaseModel spec={resolved.case} mode={exploded ? "open" : caseMode} />} />}
        {FIXED_SLOTS.map((k) => (
          <SlotRenderer key={k} slotKey={k} placement={byKey.get(k)} reducedMotion={reducedMotion} />
        ))}
        {storage.map((p) => (
          <SlotRenderer key={p.key} slotKey={p.key} placement={p} reducedMotion={reducedMotion} />
        ))}
      </group>
      <CameraRig framing={framing} reducedMotion={reducedMotion} turntable={studio} />
      <LabelProjector />
    </>
  );
}

export default function PcScene({ active, reducedMotion, environment = "workshop" }: { active: boolean; reducedMotion: boolean; environment?: SceneEnvironment }) {
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
      <SceneContents reducedMotion={reducedMotion} environment={environment} />
    </Canvas>
  );
}
