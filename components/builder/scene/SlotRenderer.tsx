"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useBuildStore, type MotionState } from "@/features/build-state/store";
import type { Pose } from "@/features/installation/anchors";
import { EXPLODE_OFFSETS, installPath, profileForPlacement, removalPath, type Keyframe } from "@/features/installation/motion";
import type { Placement, PlacementState } from "@/features/installation/placement";
import { useModelPreviews } from "@/features/models/preview";
import { assetFor } from "@/features/models/registry";
import { AssetModel } from "./AssetModel";
import { boundsFor, type LocalBounds } from "./bounds";
import { LabelAnchor } from "./labels";
import { CoolerModel, CpuModel, FanPackModel, GpuModel, MotherboardModel, PsuModel, RamModel, StorageModel } from "./models";

/** GLB from the model registry (or a Studio preview) when available, otherwise the procedural model. */
function ModelFor({ p, spin }: { p: Placement; spin: boolean }) {
  const previews = useModelPreviews((s) => s.assets);
  return <AssetModel asset={assetFor(p.component, previews)} fallback={<ProceduralModel p={p} spin={spin} />} />;
}

function ProceduralModel({ p, spin }: { p: Placement; spin: boolean }) {
  const c = p.component;
  switch (c.category) {
    case "motherboard":
      return <MotherboardModel spec={c} />;
    case "cpu":
      return <CpuModel spec={c} />;
    case "cooler":
      return <CoolerModel spec={c} radiator={p.state === "mounted" ? p.radiator : undefined} spin={spin} />;
    case "ram":
      return <RamModel spec={c} items={p.children ?? [{ offset: [0, 0, 0] }]} />;
    case "gpu":
      return <GpuModel spec={c} spin={spin} />;
    case "storage":
      return <StorageModel spec={c} />;
    case "psu":
      return <PsuModel spec={c} />;
    case "fans":
      return <FanPackModel spec={c} items={p.children ?? []} spin={spin} />;
    default:
      return null;
  }
}

function SelectionBox({ bounds, color }: { bounds: LocalBounds; color: string }) {
  const geom = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...bounds.size)), [bounds]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <lineSegments geometry={geom} position={bounds.center}>
      <lineBasicMaterial color={color} transparent opacity={0.9} />
    </lineSegments>
  );
}

/** Brief green glow around a freshly installed part. */
function SuccessPulse({ bounds }: { bounds: LocalBounds }) {
  const mesh = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    t.current += dt;
    const k = Math.min(t.current / 0.9, 1);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.28 * (1 - k);
    m.scale.setScalar(1 + 0.06 * k);
    m.visible = k < 1;
  });
  return (
    <mesh ref={mesh} position={bounds.center}>
      <boxGeometry args={bounds.size} />
      <meshBasicMaterial color="#3fcf8e" transparent opacity={0.28} depthWrite={false} />
    </mesh>
  );
}

const tmpTarget = new THREE.Vector3();

export function SlotRenderer({ slotKey, placement, reducedMotion }: { slotKey: string; placement: Placement | undefined; reducedMotion: boolean }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const [displayed, setDisplayed] = useState<Placement | undefined>(placement);
  const displayedRef = useRef(displayed);
  const placementRef = useRef(placement);
  const lastState = useRef<PlacementState | null>(null);
  /** null until the first layout effect decides whether the initial mount animates. */
  const pendingIntro = useRef<boolean | null>(null);
  const first = useRef(true);

  // Mirror latest props/state for timeline callbacks. Declared first so later effects see fresh values.
  useLayoutEffect(() => {
    displayedRef.current = displayed;
    placementRef.current = placement;
  });
  const [pulse, setPulse] = useState(0);
  const exploded = useBuildStore((s) => s.view.exploded);
  const selected = useBuildStore((s) => s.selectedSlot === slotKey);
  const hovered = useBuildStore((s) => s.hoveredSlot === slotKey);
  const skipNonce = useBuildStore((s) => s.skipNonce);
  const previews = useModelPreviews((s) => s.assets);

  function isInstant() {
    if (reducedMotion) return true;
    const cat = (placementRef.current ?? displayedRef.current)?.category;
    const meta = cat ? useBuildStore.getState().changeMeta[cat] : undefined;
    return !meta || meta.instant;
  }

  const setMotion = (state: MotionState | null) => useBuildStore.getState().setMotion(slotKey, state);
  const log = (kind: "success" | "warning", text: string) => useBuildStore.getState().log(kind, text);

  const stop = () => {
    if (tl.current) {
      tl.current.kill();
      tl.current = null;
      setMotion(null);
    }
  };

  const currentPose = (g: THREE.Group): Pose => ({
    position: [g.position.x, g.position.y, g.position.z],
    rotation: [g.rotation.x, g.rotation.y, g.rotation.z],
  });

  const snap = (p: Placement) => {
    stop();
    const g = outer.current;
    if (!g) return;
    g.position.set(...p.target.position);
    g.rotation.set(...p.target.rotation);
    g.scale.setScalar(1);
  };

  const run = (opts: { frames: Keyframe[]; kind: MotionState; intro?: boolean; outro?: boolean; onDone?: () => void }) => {
    const g = outer.current;
    if (!g) return;
    if (tl.current) tl.current.kill();
    const t = gsap.timeline({
      onComplete: () => {
        tl.current = null;
        setMotion(null);
        opts.onDone?.();
      },
    });
    setMotion(opts.kind);
    if (opts.intro) t.fromTo(g.scale, { x: 0.001, y: 0.001, z: 0.001 }, { x: 1, y: 1, z: 1, duration: 0.35, ease: "back.out(1.6)" });
    for (const f of opts.frames) {
      t.to(g.position, { x: f.position[0], y: f.position[1], z: f.position[2], duration: f.duration, ease: f.ease });
      t.to(g.rotation, { x: f.rotation[0], y: f.rotation[1], z: f.rotation[2], duration: f.duration, ease: f.ease }, "<");
    }
    if (opts.outro) t.to(g.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.25, ease: "power2.in" });
    tl.current = t;
  };

  const onArrived = (p: Placement) => {
    if (p.state === "mounted") {
      setPulse((n) => n + 1);
      log("success", `${p.component.name}: установлен`);
    } else {
      log("warning", `${p.component.name}: не установлен — ${p.reasonText ?? "конфликт"}`);
    }
  };

  // New component in this slot: intro from the bench (animated) or snap (instant).
  useLayoutEffect(() => {
    const p = displayedRef.current;
    const g = outer.current;
    if (!p || !g) return;
    if (pendingIntro.current === null) pendingIntro.current = !isInstant();
    if (pendingIntro.current) {
      pendingIntro.current = false;
      g.position.set(...p.bench.position);
      g.rotation.set(...p.bench.rotation);
      const frames = p.state === "mounted" ? installPath(profileForPlacement(p), p.bench, p.target) : [];
      run({ frames, kind: "installing", intro: true, onDone: () => onArrived(p) });
    } else {
      snap(p);
    }
    lastState.current = p.state;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayed?.component.id]);

  const signature = placement
    ? `${placement.component.id}|${placement.state}|${placement.target.position.join(",")}|${placement.target.rotation.join(",")}|${placement.children?.length ?? 0}`
    : "none";

  // Placement changed: remove, swap, mount, park or follow a moved anchor.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const incoming = placementRef.current;
    const cur = displayedRef.current;
    const instant = isInstant();
    const g = outer.current;

    if (!incoming) {
      if (!cur) return;
      if (instant || !g) {
        stop();
        setDisplayed(undefined);
        return;
      }
      run({
        frames: removalPath(profileForPlacement(cur), currentPose(g), cur.bench, lastState.current === "mounted"),
        kind: "removing",
        outro: true,
        onDone: () => setDisplayed(undefined),
      });
      return;
    }

    if (!cur || cur.component.id !== incoming.component.id) {
      if (cur && !instant && g) {
        run({
          frames: removalPath(profileForPlacement(cur), currentPose(g), cur.bench, lastState.current === "mounted"),
          kind: "removing",
          outro: true,
          onDone: () => {
            pendingIntro.current = true;
            setDisplayed(placementRef.current);
          },
        });
      } else {
        stop();
        pendingIntro.current = !instant;
        setDisplayed(incoming);
      }
      return;
    }

    setDisplayed(incoming);
    if (instant || !g) {
      snap(incoming);
      lastState.current = incoming.state;
      return;
    }
    const profile = profileForPlacement(incoming);
    const from = currentPose(g);
    let frames: Keyframe[];
    if (incoming.state === "mounted" && lastState.current === "mounted") {
      frames = [{ position: incoming.target.position, rotation: incoming.target.rotation, duration: 0.7, ease: "power2.inOut", label: "travel" }];
    } else if (incoming.state === "mounted") {
      frames = installPath(profile, from, incoming.target);
    } else {
      frames = removalPath(profile, from, incoming.bench, lastState.current === "mounted");
    }
    const wasMounted = lastState.current === "mounted";
    lastState.current = incoming.state;
    run({
      frames,
      kind: incoming.state === "mounted" ? "installing" : "removing",
      onDone: () => {
        if (!(wasMounted && incoming.state === "mounted")) onArrived(incoming);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Skip: jump every running timeline to its end (fires completion callbacks).
  useEffect(() => {
    if (skipNonce && tl.current) tl.current.progress(1);
  }, [skipNonce]);

  useEffect(
    () => () => {
      tl.current?.kill();
    },
    [],
  );

  // Exploded view offset on the inner group, damped per frame.
  useFrame((_, dt) => {
    const g = inner.current;
    const p = displayedRef.current;
    if (!g || !p) return;
    const off = exploded && p.state === "mounted" ? EXPLODE_OFFSETS[p.category] : [0, 0, 0];
    tmpTarget.set(off[0], off[1], off[2]);
    if (reducedMotion) g.position.copy(tmpTarget);
    else g.position.lerp(tmpTarget, 1 - Math.exp(-dt * 6));
  });

  if (!displayed) return <group ref={outer} />;

  const bounds = boundsFor(displayed, previews);
  const conflict = displayed.state === "parked" && displayed.reason === "conflict";
  const labelPos: [number, number, number] = [bounds.center[0], bounds.center[1] + bounds.size[1] / 2 + 0.12, bounds.center[2]];
  if (displayed.category === "gpu" || displayed.category === "motherboard") labelPos[2] = bounds.center[2] + bounds.size[2] / 2;

  return (
    <group
      ref={outer}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        useBuildStore.getState().selectSlot(slotKey);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        useBuildStore.getState().setHovered(slotKey);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        if (useBuildStore.getState().hoveredSlot === slotKey) useBuildStore.getState().setHovered(null);
        document.body.style.cursor = "";
      }}
    >
      <group ref={inner}>
        <ModelFor p={displayed} spin={!reducedMotion && displayed.state === "mounted"} />
        {(selected || conflict) && <SelectionBox bounds={bounds} color={conflict ? "#f25c6e" : "#8d7dff"} />}
        {hovered && !selected && !conflict && <SelectionBox bounds={bounds} color="#4fd1e3" />}
        {pulse > 0 && <SuccessPulse key={pulse} bounds={bounds} />}
        {/* The label itself is DOM, rendered by <SceneLabels> outside the Canvas. */}
        <LabelAnchor id={slotKey} position={labelPos} />
      </group>
    </group>
  );
}
