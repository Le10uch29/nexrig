"use client";

/**
 * Workshop backdrop: brick wall, shelves with monitors, small PCs, boxed parts and tools, a desk
 * with a monitor and a lamp. Everything is procedural (canvas textures, primitives) — no
 * downloaded assets, and boxes/screens carry generic labels, not real brands.
 * Light motion (spinning fans, RGB hue drift, a scrolling chart, dust) stops with reduced motion.
 * y = 0 is the desk top; the case and the assembly mat stand on it.
 */
import { Environment, Lightformer, Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const DESK_THICK = 0.3;
const WALL_Z = -5.4;

/* ------------------------------------------------------------------ canvas textures */

function useCanvasTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number, repeat: [number, number] = [1, 1]) {
  const tex = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext("2d")!, w, h);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 4;
    return t;
    // Drawing functions are static; textures are created once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, repeat[0], repeat[1]]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Deterministic pseudo-random so the texture looks the same on every render. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function drawBricks(g: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(7);
  g.fillStyle = "#1c1a19";
  g.fillRect(0, 0, w, h);
  const bh = h / 8;
  const bw = w / 4;
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < 5; col++) {
      const shade = 34 + Math.floor(r() * 16);
      g.fillStyle = `rgb(${shade + 14},${shade + 4},${shade})`;
      g.fillRect(col * bw + off + 3, row * bh + 3, bw - 6, bh - 6);
    }
  }
}

function drawPlanks(g: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(11);
  for (let i = 0; i < 6; i++) {
    const v = 58 + Math.floor(r() * 18);
    g.fillStyle = `rgb(${v + 18},${v + 4},${v - 12})`;
    g.fillRect(0, (i * h) / 6, w, h / 6 - 2);
    g.strokeStyle = "rgba(0,0,0,0.18)";
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      const y = (i * h) / 6 + r() * (h / 6);
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + 3, w * 0.6, y - 3, w, y + 1);
      g.stroke();
    }
  }
}

function drawPegboard(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = "#3a3229";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#14110e";
  for (let x = 8; x < w; x += 16) for (let y = 8; y < h; y += 16) g.fillRect(x - 2, y - 2, 4, 4);
}

/** Generic dashboard UI for the desk monitor (no product branding). */
function drawDashboard(g: CanvasRenderingContext2D, w: number, h: number) {
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, "#0d1120");
  grd.addColorStop(1, "#141a30");
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#1c2440";
  g.fillRect(0, 0, w, 26);
  g.fillStyle = "#8d7dff";
  g.font = "bold 15px sans-serif";
  g.fillText("SYSTEM MONITOR", 12, 18);
  const r = rng(3);
  // Tiles.
  const tiles = ["CPU", "GPU", "RAM", "FPS"];
  tiles.forEach((t, i) => {
    const x = 12 + i * ((w - 24) / 4);
    g.fillStyle = "#1a2138";
    g.fillRect(x, 38, (w - 24) / 4 - 10, 70);
    g.fillStyle = "#7f8bad";
    g.font = "12px sans-serif";
    g.fillText(t, x + 10, 58);
    g.fillStyle = i === 3 ? "#4fd1e3" : "#e8ebf3";
    g.font = "bold 26px sans-serif";
    g.fillText(i === 3 ? "144" : `${40 + Math.floor(r() * 50)}%`, x + 10, 94);
  });
  // Bars.
  for (let i = 0; i < 18; i++) {
    const bh = 30 + r() * 90;
    g.fillStyle = i % 3 === 0 ? "#22a6bd" : "#8d7dff";
    g.fillRect(16 + i * ((w - 32) / 18), h - 16 - bh, (w - 32) / 18 - 6, bh);
  }
}

/** Seamless scrolling frame-time line for the second screen. */
function drawGraph(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = "#0a0f1a";
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(127,139,173,0.18)";
  for (let y = 0; y < h; y += h / 6) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  g.strokeStyle = "#4fd1e3";
  g.lineWidth = 3;
  g.beginPath();
  for (let x = 0; x <= w; x += 4) {
    // Periodic over the texture width so the scroll wraps without a seam.
    const y = h * 0.5 + Math.sin((x / w) * Math.PI * 6) * h * 0.12 + Math.sin((x / w) * Math.PI * 22) * h * 0.05;
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

function drawBoxLabel(color: string, accent: string) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = accent;
    g.fillRect(0, h * 0.62, w, h * 0.14);
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.font = `bold ${Math.round(h * 0.16)}px sans-serif`;
    g.fillText("GRAPHICS", w * 0.08, h * 0.32);
    g.font = `${Math.round(h * 0.1)}px sans-serif`;
    g.fillText("16 GB · PCIe", w * 0.08, h * 0.5);
  };
}

/* ------------------------------------------------------------------ primitives */

function Box({ size, position, color, rotation, roughness = 0.7, metalness = 0.1, map, emissive, emissiveIntensity = 0 }: { size: [number, number, number]; position: [number, number, number]; color: string; rotation?: [number, number, number]; roughness?: number; metalness?: number; map?: THREE.Texture; emissive?: string; emissiveIntensity?: number }) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} map={map} emissive={emissive ?? "#000000"} emissiveIntensity={emissiveIntensity} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ props */

/** Small display PC on a shelf: glass side, three RGB fans with a slow hue drift. */
function ShelfPC({ position, color, scale = 1, hue = 0.72, animate }: { position: [number, number, number]; color: string; scale?: number; hue?: number; animate: boolean }) {
  const fans = useRef<THREE.Group>(null);
  const ringMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#111111", emissive: new THREE.Color().setHSL(hue, 0.9, 0.5), emissiveIntensity: 1.3 }), [hue]);
  useEffect(() => () => ringMat.dispose(), [ringMat]);
  useFrame(({ clock }, dt) => {
    if (!animate) return;
    ringMat.emissive.setHSL((hue + clock.elapsedTime * 0.04) % 1, 0.9, 0.5);
    fans.current?.children.forEach((f) => (f.rotation.z -= dt * 6));
  });
  const W = 1.2;
  const H = 2.4;
  const D = 2.3;
  return (
    <group position={position} scale={scale}>
      <Box size={[D, H, W]} position={[0, H / 2, 0]} color={color} roughness={0.5} metalness={0.3} />
      {/* dark interior seen through the glass side */}
      <Box size={[D - 0.12, H - 0.12, 0.02]} position={[0, H / 2, W / 2 + 0.005]} color="#07080b" roughness={0.3} />
      <mesh position={[0, H / 2, W / 2 + 0.03]}>
        <boxGeometry args={[D - 0.06, H - 0.06, 0.02]} />
        <meshPhysicalMaterial color="#b9c6dc" transparent opacity={0.14} roughness={0.05} clearcoat={1} />
      </mesh>
      <group ref={fans}>
        {[0.55, 1.2, 1.85].map((y) => (
          <group key={y} position={[D / 2 - 0.35, y, W / 2 + 0.02]}>
            <mesh material={ringMat}>
              <torusGeometry args={[0.24, 0.025, 8, 32]} />
            </mesh>
            {[0, 1, 2, 3, 4].map((k) => (
              <mesh key={k} rotation={[0, 0, (k / 5) * Math.PI * 2]} position={[0, 0, -0.01]}>
                <boxGeometry args={[0.06, 0.4, 0.01]} />
                <meshStandardMaterial color="#1b1d22" />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      {/* tiny GPU glow line */}
      <Box size={[1.2, 0.03, 0.02]} position={[-0.25, 1.0, W / 2 + 0.01]} color="#000000" emissive="#ffffff" emissiveIntensity={0.6} />
    </group>
  );
}

function Monitor({ position, rotationY = 0, width = 5.6, screen, emissive = 0.9, scroll = 0 }: { position: [number, number, number]; rotationY?: number; width?: number; screen: THREE.Texture; emissive?: number; scroll?: number }) {
  const h = width * 0.5625;
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  // Scrolling screens (live chart); the texture wraps seamlessly.
  useFrame((_, dt) => {
    const map = mat.current?.map;
    if (scroll && map) map.offset.x = (map.offset.x + dt * scroll) % 1;
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* stand */}
      <Box size={[1.4, 0.06, 0.9]} position={[0, 0.03, 0]} color="#1d1f25" metalness={0.6} roughness={0.35} />
      <Box size={[0.22, h * 0.55, 0.12]} position={[0, h * 0.28, -0.18]} color="#25282f" metalness={0.6} roughness={0.35} />
      {/* bezel and screen */}
      <Box size={[width + 0.12, h + 0.12, 0.14]} position={[0, h * 0.55 + h / 2, -0.12]} color="#101115" roughness={0.4} />
      <mesh position={[0, h * 0.55 + h / 2, -0.045]}>
        <planeGeometry args={[width, h]} />
        <meshStandardMaterial ref={mat} map={screen} emissiveMap={screen} emissive="#ffffff" emissiveIntensity={emissive} roughness={0.25} toneMapped={false} />
      </mesh>
    </group>
  );
}

function PartsBox({ position, size, color, accent, rotationY = 0, label }: { position: [number, number, number]; size: [number, number, number]; color: string; accent: string; rotationY?: number; label?: THREE.Texture }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, size[1] / 2, 0]}>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {label ? (
        <mesh position={[0, size[1] / 2, size[2] / 2 + 0.002]}>
          <planeGeometry args={[size[0] * 0.96, size[1] * 0.92]} />
          <meshStandardMaterial map={label} roughness={0.7} />
        </mesh>
      ) : (
        <Box size={[size[0] * 1.002, size[1] * 0.12, size[2] * 1.002]} position={[0, size[1] * 0.7, 0]} color={accent} roughness={0.6} />
      )}
    </group>
  );
}

function Plant({ position }: { position: [number, number, number] }) {
  const leaves = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: 9 }, (_, i) => ({ a: (i / 9) * Math.PI * 2 + r() * 0.4, tilt: 0.5 + r() * 0.5, len: 0.7 + r() * 0.5 }));
  }, []);
  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.32, 0.24, 0.6, 20]} />
        <meshStandardMaterial color="#c9c3b8" roughness={0.9} />
      </mesh>
      {leaves.map((l, i) => (
        <mesh key={i} position={[Math.cos(l.a) * 0.15, 0.6 + l.len * 0.35, Math.sin(l.a) * 0.15]} rotation={[Math.sin(l.a) * l.tilt, 0, -Math.cos(l.a) * l.tilt]} scale={[0.12, l.len * 0.5, 0.05]}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color={i % 2 ? "#2f6b3d" : "#3d8049"} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function DeskLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.45, 0.5, 0.1, 24]} />
        <meshStandardMaterial color="#1e2026" metalness={0.6} roughness={0.35} />
      </mesh>
      <Box size={[0.08, 2.0, 0.08]} position={[0.25, 1.0, 0]} rotation={[0, 0, -0.25]} color="#2a2d34" metalness={0.6} roughness={0.35} />
      <Box size={[0.08, 1.6, 0.08]} position={[-0.25, 2.55, 0]} rotation={[0, 0, 1.0]} color="#2a2d34" metalness={0.6} roughness={0.35} />
      <group position={[-0.95, 2.9, 0]} rotation={[0, 0, 2.3]}>
        <mesh>
          <coneGeometry args={[0.38, 0.6, 24, 1, true]} />
          <meshStandardMaterial color="#2a2d34" metalness={0.5} roughness={0.4} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.18, 0]}>
          <sphereGeometry args={[0.13, 16, 12]} />
          <meshStandardMaterial color="#fff3d6" emissive="#ffd9a0" emissiveIntensity={3} toneMapped={false} />
        </mesh>
      </group>
      <pointLight position={[-1.1, 2.6, 0.2]} intensity={6} distance={7} decay={2} color="#ffd9a0" />
    </group>
  );
}

function Pegboard({ position, size }: { position: [number, number, number]; size: [number, number] }) {
  const tex = useCanvasTexture(drawPegboard, 256, 256, [size[0] / 2, size[1] / 2]);
  const tools = useMemo(
    () => [
      { x: -1.6, len: 1.1, color: "#c4304a" },
      { x: -1.2, len: 1.3, color: "#e09a2b" },
      { x: -0.8, len: 1.0, color: "#2f6fd6" },
      { x: 0.2, len: 0.9, color: "#3fcf8e" },
      { x: 0.6, len: 1.2, color: "#c4304a" },
    ],
    [],
  );
  return (
    <group position={position}>
      <mesh>
        <planeGeometry args={size} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      {/* screwdrivers: handle + shaft */}
      {tools.map((t) => (
        <group key={t.x} position={[t.x, 0.2, 0.08]}>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.07, 0.08, 0.5, 12]} />
            <meshStandardMaterial color={t.color} roughness={0.5} />
          </mesh>
          <mesh position={[0, -0.05 - t.len * 0.3, 0]}>
            <cylinderGeometry args={[0.02, 0.02, t.len * 0.6, 8]} />
            <meshStandardMaterial color="#c9ccd2" metalness={0.9} roughness={0.25} />
          </mesh>
        </group>
      ))}
      {/* pliers and a cable coil */}
      <Box size={[0.12, 1.0, 0.06]} position={[1.25, 0.1, 0.06]} rotation={[0, 0, 0.12]} color="#2b2e35" metalness={0.7} roughness={0.35} />
      <Box size={[0.12, 1.0, 0.06]} position={[1.42, 0.1, 0.06]} rotation={[0, 0, -0.12]} color="#2b2e35" metalness={0.7} roughness={0.35} />
      <mesh position={[2.3, 0.3, 0.12]}>
        <torusGeometry args={[0.38, 0.07, 10, 28]} />
        <meshStandardMaterial color="#e09a2b" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Shelf({ x0, x1, y }: { x0: number; x1: number; y: number }) {
  const tex = useCanvasTexture(drawPlanks, 256, 64, [Math.max(1, (x1 - x0) / 6), 1]);
  const len = x1 - x0;
  const brackets = Math.max(2, Math.round(len / 5) + 1);
  return (
    <group>
      <mesh position={[(x0 + x1) / 2, y - 0.08, WALL_Z + 0.85]}>
        <boxGeometry args={[len, 0.16, 1.7]} />
        <meshStandardMaterial map={tex} roughness={0.75} />
      </mesh>
      {Array.from({ length: brackets }, (_, i) => (
        <Box key={i} size={[0.08, 0.6, 1.2]} position={[x0 + 0.3 + (i * (len - 0.6)) / (brackets - 1), y - 0.46, WALL_Z + 0.6]} color="#24262c" metalness={0.7} roughness={0.35} />
      ))}
      {/* warm LED strip under the shelf */}
      <Box size={[len - 0.4, 0.03, 0.05]} position={[(x0 + x1) / 2, y - 0.18, WALL_Z + 1.55]} color="#000000" emissive="#ffcf8a" emissiveIntensity={1.6} />
    </group>
  );
}

/* ------------------------------------------------------------------ scene */

export function Workshop({ centerX, animate = true }: { centerX: number; animate?: boolean }) {
  const bricks = useCanvasTexture(drawBricks, 512, 512, [7, 4]);
  const floor = useCanvasTexture(drawPlanks, 256, 256, [6, 6]);
  const dash = useCanvasTexture(drawDashboard, 640, 360);
  const graph = useCanvasTexture(drawGraph, 512, 288);
  const gpuBox = useCanvasTexture(drawBoxLabel("#1b1e28", "#8d7dff"), 256, 160);
  const gpuBox2 = useCanvasTexture(drawBoxLabel("#22252b", "#3fcf8e"), 256, 160);
  const deskW = 17;
  const deskD = 8.5;
  const L = centerX - 13;
  return (
    <group>
      {/* room */}
      <mesh position={[centerX, 3, WALL_Z]}>
        <planeGeometry args={[30, 22]} />
        <meshStandardMaterial map={bricks} roughness={0.95} />
      </mesh>
      <mesh position={[L - 0.5, 3, WALL_Z + 9]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[18, 22]} />
        <meshStandardMaterial color="#1a1817" roughness={0.95} />
      </mesh>
      <mesh position={[centerX, -7.6, WALL_Z + 9]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 18]} />
        <meshStandardMaterial map={floor} color="#8a7a6a" roughness={0.85} />
      </mesh>

      {/* desk: satin dark top with a thin lighter edge, steel legs */}
      <mesh position={[centerX, -DESK_THICK / 2, 0]}>
        <boxGeometry args={[deskW, DESK_THICK, deskD]} />
        <meshStandardMaterial color="#1f2028" roughness={0.42} metalness={0.15} envMapIntensity={0.6} />
      </mesh>
      <mesh position={[centerX, -0.004, deskD / 2 - 0.01]}>
        <boxGeometry args={[deskW, 0.012, 0.02]} />
        <meshStandardMaterial color="#3a4256" roughness={0.3} metalness={0.6} />
      </mesh>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} size={[0.3, 7.3, 0.3]} position={[centerX + sx * (deskW / 2 - 0.5), -3.95, sz * (deskD / 2 - 0.5)]} color="#2a2d34" metalness={0.7} roughness={0.35} />))}

      {/* Props sit inside the default camera window (about centerX ± 7 on the wall). */}
      {/* desk: monitor behind the assembly mat, lamp and pegboard left of the case */}
      <Monitor position={[centerX + 4.0, 0, -3.6]} rotationY={-0.15} width={4.2} screen={dash} />
      <DeskLamp position={[centerX - 5.6, 0, -3.3]} />
      <Pegboard position={[centerX - 6.2, 1.7, WALL_Z + 0.02]} size={[5, 2.8]} />

      {/* lower shelf, just above the case */}
      <Shelf x0={centerX - 7.6} x1={centerX + 7.6} y={5.5} />
      <Monitor position={[centerX - 5.2, 5.5, WALL_Z + 0.95]} width={3.0} screen={graph} emissive={0.8} scroll={animate ? 0.04 : 0} />
      <PartsBox position={[centerX - 2.2, 5.5, WALL_Z + 1.0]} size={[2.0, 1.25, 0.45]} color="#1b1e28" accent="#8d7dff" label={gpuBox} />
      <PartsBox position={[centerX - 2.1, 5.5, WALL_Z + 0.5]} size={[2.0, 1.55, 0.45]} color="#22252b" accent="#3fcf8e" label={gpuBox2} rotationY={-0.05} />
      <Plant position={[centerX + 0.6, 5.5, WALL_Z + 0.9]} />
      <ShelfPC position={[centerX + 3.2, 5.5, WALL_Z + 0.9]} color="#e7e8ec" scale={0.85} hue={0.52} animate={animate} />
      <PartsBox position={[centerX + 6.0, 5.5, WALL_Z + 0.9]} size={[1.6, 0.4, 1.3]} color="#26292f" accent="#e09a2b" />
      <PartsBox position={[centerX + 6.0, 5.9, WALL_Z + 0.9]} size={[1.5, 0.35, 1.2]} color="#2c2f36" accent="#4fd1e3" rotationY={0.12} />

      {/* upper shelf */}
      <Shelf x0={centerX - 7.6} x1={centerX + 7.6} y={8.1} />
      <ShelfPC position={[centerX - 5.0, 8.1, WALL_Z + 0.9]} color="#16181d" scale={0.75} hue={0.72} animate={animate} />
      <Monitor position={[centerX - 1.0, 8.1, WALL_Z + 0.95]} width={3.0} screen={dash} emissive={0.6} />
      <ShelfPC position={[centerX + 2.6, 8.1, WALL_Z + 0.9]} color="#202329" scale={0.75} hue={0.95} animate={animate} />
      {[0, 1, 2].map((i) => (
        <PartsBox key={i} position={[centerX + 5.6 + i * 0.05, 8.1 + i * 0.32, WALL_Z + 0.9]} size={[2.4, 0.3, 1.2]} color={["#1f2a3a", "#2a1f1f", "#202a22"][i]} accent={["#2f6fd6", "#c4304a", "#3fcf8e"][i]} rotationY={i * 0.05} />
      ))}

      {/* soft practical lights from the shelves */}
      <pointLight position={[centerX - 4, 5.0, WALL_Z + 2]} intensity={5} distance={7} color="#ffcf8a" />
      <pointLight position={[centerX + 4, 5.0, WALL_Z + 2]} intensity={5} distance={7} color="#ffcf8a" />
      <pointLight position={[centerX, 7.6, WALL_Z + 2]} intensity={4} distance={8} color="#ffd9a8" />

      {animate && <Sparkles count={70} scale={[16, 9, 7]} position={[centerX, 4, -1]} size={1.6} speed={0.18} opacity={0.22} color="#ffe2b8" />}

      {/* Studio softboxes rendered once into the environment map (reflections only). */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={["#0f0d0c"]} />
        <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[0, 6, 6]} rotation={[-Math.PI / 4, 0, 0]} scale={[12, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ffe9cf" position={[-8, 3, 2]} rotation={[0, Math.PI / 2, 0]} scale={[6, 4, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#c9bfff" position={[8, 3, -2]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 4, 1]} />
        <Lightformer form="ring" intensity={0.6} color="#ffcf8a" position={[0, 2, -8]} scale={4} />
      </Environment>
    </group>
  );
}
