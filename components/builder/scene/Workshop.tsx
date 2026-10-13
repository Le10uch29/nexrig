"use client";

/**
 * Procedural workshop surroundings: workbench, brick walls, pegboard with tools, shelves and a
 * hanging lamp. Textures are drawn on canvases at runtime — no external assets.
 * y = 0 is the workbench top (the case and the assembly mat stand on it).
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";

const BENCH_TOP = 0;
const BENCH_THICK = 0.35;
const FLOOR_Y = -7.5;

/** Small deterministic PRNG so textures don't change between renders. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat: [number, number]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function useTextures() {
  const textures = useMemo(() => {
    const wood = canvasTexture(
      512,
      512,
      (ctx) => {
        const r = rng(7);
        const planks = 6;
        for (let i = 0; i < planks; i++) {
          const y = (i * 512) / planks;
          const base = 70 + r() * 25;
          ctx.fillStyle = `hsl(28, 38%, ${base / 4.2}%)`;
          ctx.fillRect(0, y, 512, 512 / planks);
          for (let g = 0; g < 40; g++) {
            ctx.strokeStyle = `hsla(26, 40%, ${10 + r() * 14}%, ${0.15 + r() * 0.2})`;
            ctx.lineWidth = 0.6 + r() * 1.4;
            const gy = y + r() * (512 / planks);
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.bezierCurveTo(170, gy + (r() - 0.5) * 8, 340, gy + (r() - 0.5) * 8, 512, gy + (r() - 0.5) * 6);
            ctx.stroke();
          }
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fillRect(0, y, 512, 2);
        }
      },
      [3, 2],
    );
    const brick = canvasTexture(
      512,
      512,
      (ctx) => {
        const r = rng(11);
        ctx.fillStyle = "#2a2422";
        ctx.fillRect(0, 0, 512, 512);
        const bh = 32;
        const bw = 96;
        for (let row = 0; row < 512 / bh; row++) {
          const off = row % 2 ? bw / 2 : 0;
          for (let x = -bw; x < 512 + bw; x += bw) {
            const l = 18 + r() * 9;
            ctx.fillStyle = `hsl(${10 + r() * 10}, ${28 + r() * 12}%, ${l}%)`;
            ctx.fillRect(x + off + 3, row * bh + 3, bw - 6, bh - 6);
          }
        }
      },
      [6, 3],
    );
    const concrete = canvasTexture(
      256,
      256,
      (ctx) => {
        const r = rng(3);
        ctx.fillStyle = "#3a3a3c";
        ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 4000; i++) {
          ctx.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.035)`;
          ctx.fillRect(r() * 256, r() * 256, 2, 2);
        }
      },
      [10, 10],
    );
    const pegboard = canvasTexture(
      256,
      256,
      (ctx) => {
        ctx.fillStyle = "#6e5a43";
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = "#2b2219";
        for (let y = 8; y < 256; y += 16) {
          for (let x = 8; x < 256; x += 16) {
            ctx.beginPath();
            ctx.arc(x, y, 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      },
      [6, 3],
    );
    return { wood, brick, concrete, pegboard };
  }, []);
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures]);
  return textures;
}

function Tool({ kind, position, color }: { kind: "wrench" | "screwdriver" | "pliers" | "hammer"; position: [number, number, number]; color: string }) {
  const steel = <meshStandardMaterial color="#b9bdc4" metalness={0.85} roughness={0.3} />;
  if (kind === "screwdriver")
    return (
      <group position={position}>
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.07, 0.08, 0.7, 12]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
        <mesh position={[0, -0.35, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.75, 8]} />
          {steel}
        </mesh>
      </group>
    );
  if (kind === "wrench")
    return (
      <group position={position}>
        <mesh>
          <boxGeometry args={[0.1, 1.4, 0.04]} />
          {steel}
        </mesh>
        <mesh position={[0, 0.75, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.13, 0.05, 8, 16, Math.PI * 1.5]} />
          {steel}
        </mesh>
      </group>
    );
  if (kind === "hammer")
    return (
      <group position={position}>
        <mesh>
          <cylinderGeometry args={[0.05, 0.05, 1.3, 10]} />
          <meshStandardMaterial color="#8a5a32" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.65, 0]}>
          <boxGeometry args={[0.45, 0.16, 0.16]} />
          {steel}
        </mesh>
      </group>
    );
  return (
    <group position={position}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.06, -0.15, 0]} rotation={[0, 0, s * 0.12]}>
          <boxGeometry args={[0.06, 0.8, 0.04]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[0.12, 0.35, 0.05]} />
        {steel}
      </mesh>
    </group>
  );
}

function Shelf({ position, width, boxes }: { position: [number, number, number]; width: number; boxes: { x: number; size: [number, number, number]; color: string }[] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.9, 0.08, width]} />
        <meshStandardMaterial color="#5a4330" roughness={0.8} />
      </mesh>
      {[-width / 2 + 0.3, width / 2 - 0.3].map((z) => (
        <mesh key={z} position={[-0.35, -0.2, z]}>
          <boxGeometry args={[0.1, 0.4, 0.06]} />
          <meshStandardMaterial color="#2a2c31" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {boxes.map((b, i) => (
        <mesh key={i} position={[0, 0.04 + b.size[1] / 2, b.x]}>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color={b.color} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

export function Workshop({ benchCenterX }: { benchCenterX: number }) {
  const tex = useTextures();
  const benchW = 17;
  const benchD = 8.5;
  const cx = benchCenterX;
  const backZ = -benchD / 2 - 0.9;
  const leftX = cx - benchW / 2 - 2.5;
  return (
    <group>
      {/* floor and walls */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, FLOOR_Y, 0]}>
        <planeGeometry args={[60, 40]} />
        <meshStandardMaterial map={tex.concrete} roughness={0.95} />
      </mesh>
      <mesh position={[cx, 3, backZ - 0.05]}>
        <planeGeometry args={[60, 24]} />
        <meshStandardMaterial map={tex.brick} roughness={0.95} />
      </mesh>
      <mesh position={[leftX, 3, 6]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[30, 24]} />
        <meshStandardMaterial map={tex.brick} roughness={0.95} />
      </mesh>

      {/* workbench */}
      <mesh position={[cx, BENCH_TOP - BENCH_THICK / 2, 0]}>
        <boxGeometry args={[benchW, BENCH_THICK, benchD]} />
        <meshStandardMaterial map={tex.wood} roughness={0.75} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[cx + sx * (benchW / 2 - 0.5), (FLOOR_Y + BENCH_TOP - BENCH_THICK) / 2, sz * (benchD / 2 - 0.5)]}>
            <boxGeometry args={[0.45, BENCH_TOP - BENCH_THICK - FLOOR_Y, 0.45]} />
            <meshStandardMaterial color="#3b2c20" roughness={0.8} />
          </mesh>
        )),
      )}
      <mesh position={[cx, FLOOR_Y + 1.6, 0]}>
        <boxGeometry args={[benchW - 1.2, 0.2, benchD - 1.2]} />
        <meshStandardMaterial color="#3b2c20" roughness={0.8} />
      </mesh>

      {/* pegboard with tools behind the bench */}
      <mesh position={[cx + 1, 4.2, backZ + 0.08]}>
        <boxGeometry args={[11, 5.2, 0.12]} />
        <meshStandardMaterial map={tex.pegboard} roughness={0.85} />
      </mesh>
      <group position={[cx + 1, 4.2, backZ + 0.25]}>
        <Tool kind="wrench" position={[-4.2, 0.6, 0]} color="#c4304a" />
        <Tool kind="wrench" position={[-3.7, 0.4, 0]} color="#c4304a" />
        <Tool kind="screwdriver" position={[-2.8, 0.5, 0]} color="#d23a3a" />
        <Tool kind="screwdriver" position={[-2.4, 0.5, 0]} color="#e0b23a" />
        <Tool kind="screwdriver" position={[-2.0, 0.5, 0]} color="#3a8fd8" />
        <Tool kind="pliers" position={[-1.1, 0.4, 0]} color="#e0b23a" />
        <Tool kind="hammer" position={[0.2, 0.3, 0]} color="#8a5a32" />
        <mesh position={[1.7, 0.4, 0]}>
          <torusGeometry args={[0.55, 0.06, 10, 32]} />
          <meshStandardMaterial color="#141518" roughness={0.6} />
        </mesh>
        <mesh position={[3.4, 0.1, 0.25]}>
          <boxGeometry args={[2.2, 1.6, 0.4]} />
          <meshStandardMaterial color="#b23a2a" roughness={0.55} metalness={0.2} />
        </mesh>
      </group>

      {/* shelves on the side wall */}
      <Shelf
        position={[leftX + 0.5, 4.6, 0]}
        width={6}
        boxes={[
          { x: -2, size: [0.7, 0.9, 1.4], color: "#a9845a" },
          { x: -0.4, size: [0.7, 0.6, 1.1], color: "#1d1e22" },
          { x: 1.2, size: [0.7, 1.1, 1.6], color: "#8f6e47" },
        ]}
      />
      <Shelf
        position={[leftX + 0.5, 2.4, 0]}
        width={6}
        boxes={[
          { x: -1.6, size: [0.7, 0.5, 1.8], color: "#2b2d31" },
          { x: 0.6, size: [0.7, 0.8, 1.2], color: "#a9845a" },
        ]}
      />

      {/* hanging lamp */}
      <group position={[cx - 0.5, 9.2, 0.5]}>
        <mesh position={[0, 1.5, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 3, 6]} />
          <meshStandardMaterial color="#141518" />
        </mesh>
        <mesh>
          <coneGeometry args={[1.1, 0.8, 32, 1, true]} />
          <meshStandardMaterial color="#2f4a3a" side={THREE.DoubleSide} metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, -0.25, 0]}>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshStandardMaterial color="#fff2d6" emissive="#ffcf8a" emissiveIntensity={3} />
        </mesh>
      </group>
    </group>
  );
}

export const WORKSHOP = { BENCH_TOP, FLOOR_Y };
