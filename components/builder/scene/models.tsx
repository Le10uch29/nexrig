"use client";

/**
 * Procedural hardware models. Dimensions come from the component specs and the shared layout
 * (features/installation/layout.ts); appearance is generic, not a copy of any specific product.
 * Replace any model with a licensed GLB via features/models/registry.ts, keeping the same local
 * origin convention documented on each component — anchors and install paths depend on it.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BOARD_LAYOUTS, BOARD_THICKNESS, caseFeet, caseGeometry, DIMM_LENGTH, MM, PCIE_SLOT_RANGE, PSU_DIMENSIONS, SLOT_PITCH, type Vec3 } from "@/features/installation/layout";
import type { CaseSpec, CoolerSpec, CpuSpec, FanSpec, GpuSpec, MotherboardSpec, PsuSpec, RamSpec, StorageSpec } from "@/types/hardware";
import type { CaseMode } from "@/features/build-state/store";
import type { Pose } from "@/features/installation/anchors";
import { radiatorFanSize } from "@/features/installation/fit";

type BoxProps = {
  size: Vec3;
  position?: Vec3;
  rotation?: Vec3;
  color: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
};

function Box({ size, position = [0, 0, 0], rotation, color, metalness = 0.2, roughness = 0.6, emissive, emissiveIntensity = 0, opacity }: BoxProps) {
  const transparent = opacity !== undefined && opacity < 1;
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
        emissive={emissive ?? "#000000"}
        emissiveIntensity={emissiveIntensity}
        transparent={transparent}
        opacity={opacity ?? 1}
        depthWrite={!transparent}
      />
    </mesh>
  );
}

/** Cylinder whose axis is local z (perpendicular to boards and panels in model space). */
function Cyl({
  r,
  h,
  position,
  color,
  metalness = 0.3,
  roughness = 0.5,
  axis = "z",
}: {
  r: number;
  h: number;
  position: Vec3;
  color: string;
  metalness?: number;
  roughness?: number;
  axis?: "x" | "y" | "z";
}) {
  const rotation: Vec3 = axis === "z" ? [Math.PI / 2, 0, 0] : axis === "x" ? [0, 0, Math.PI / 2] : [0, 0, 0];
  return (
    <mesh position={position} rotation={rotation}>
      <cylinderGeometry args={[r, r, h, 18]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  );
}

/** Tempered glass: clear-coated, slightly tinted, no transmission pass (cheap to render). */
function Glass({ size, position, opacity = 0.07, tint = "#c4d0e4" }: { size: Vec3; position: Vec3; opacity?: number; tint?: string }) {
  return (
    <mesh position={position} renderOrder={2}>
      <boxGeometry args={size} />
      <meshPhysicalMaterial
        color={tint}
        metalness={0}
        roughness={0.03}
        clearcoat={1}
        clearcoatRoughness={0.04}
        reflectivity={0.4}
        envMapIntensity={0.7}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ patterns */

type PatternKind = "hex" | "fins";
const patternCache = new Map<PatternKind, THREE.CanvasTexture>();

/** Tileable 64×64 masks drawn once per session. White = solid, black = opening. */
function basePattern(kind: PatternKind) {
  let tex = patternCache.get(kind);
  if (tex) return tex;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#000";
  if (kind === "hex") {
    // Staggered round perforation (wraps seamlessly).
    for (const [x, y] of [
      [16, 16],
      [48, 16],
      [0, 48],
      [32, 48],
      [64, 48],
    ]) {
      g.beginPath();
      g.arc(x, y, 11.5, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 3);
  }
  tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  patternCache.set(kind, tex);
  return tex;
}

/** Per-use clone of a shared pattern with its own repeat; disposed on unmount (image is shared). */
function usePattern(kind: PatternKind, rx: number, ry: number) {
  const tex = useMemo(() => {
    const t = basePattern(kind).clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    return t;
  }, [kind, rx, ry]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Perforated sheet (mesh front, dust filter, grilles). Plane faces +z before rotation. */
function Perforated({
  size,
  position,
  rotation,
  color,
  pitch = 0.06,
  metalness = 0.4,
  roughness = 0.55,
}: {
  size: [number, number];
  position: Vec3;
  rotation?: Vec3;
  color: string;
  pitch?: number;
  metalness?: number;
  roughness?: number;
}) {
  const rx = Math.max(1, Math.round(size[0] / pitch));
  const ry = Math.max(1, Math.round(size[1] / pitch));
  const alpha = usePattern("hex", rx, ry);
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} alphaMap={alpha} alphaTest={0.5} side={THREE.DoubleSide} />
    </mesh>
  );
}

const GOLD = "#c9a24a";
const STEEL = "#9ea3ac";
const NICKEL = "#d4d7dd";
const COPPER = "#b87333";
const DARK = "#14161b";
const PLASTIC = "#121317";

/* ------------------------------------------------------------------ fans */

/** 120 mm fan facing +z, centred on the origin. RGB ring only when the product has lighting. */
export function FanUnit({
  size = 1.2,
  depth = 0.25,
  frame = DARK,
  accent = "#3a3d45",
  rgb = false,
  spin = true,
}: {
  size?: number;
  depth?: number;
  frame?: string;
  accent?: string;
  rgb?: boolean;
  spin?: boolean;
}) {
  const blades = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spin && blades.current) blades.current.rotation.z -= dt * 9;
  });
  const r = size * 0.46;
  const bar = size * 0.12;
  const corner = size / 2 - bar / 2;
  return (
    <group>
      {/* frame */}
      <Box size={[size, bar, depth]} position={[0, corner, 0]} color={frame} roughness={0.7} />
      <Box size={[size, bar, depth]} position={[0, -corner, 0]} color={frame} roughness={0.7} />
      <Box size={[bar, size, depth]} position={[corner, 0, 0]} color={frame} roughness={0.7} />
      <Box size={[bar, size, depth]} position={[-corner, 0, 0]} color={frame} roughness={0.7} />
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r + 0.02, r + 0.02, depth * 0.9, 32, 1, true]} />
        <meshStandardMaterial color={frame} side={THREE.DoubleSide} roughness={0.7} />
      </mesh>
      {/* anti-vibration corner pads */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) => <Cyl key={`${sx}${sy}`} r={size * 0.04} h={depth + 0.01} position={[sx * corner, sy * corner, 0]} color="#2a2d34" roughness={0.9} />),
      )}
      {/* motor struts on the rear */}
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          size={[size * 0.05, r, 0.02]}
          position={[Math.sin((i * 2 * Math.PI) / 3) * r * 0.5, Math.cos((i * 2 * Math.PI) / 3) * r * 0.5, -depth / 2 + 0.02]}
          rotation={[0, 0, (-i * 2 * Math.PI) / 3]}
          color={frame}
        />
      ))}
      {rgb && (
        <mesh position={[0, 0, depth / 2]}>
          <torusGeometry args={[r, 0.018, 8, 48]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.6} />
        </mesh>
      )}
      <group ref={blades}>
        {Array.from({ length: 7 }, (_, i) => (
          <group key={i} rotation={[0, 0, (i / 7) * Math.PI * 2]}>
            <mesh position={[0, r * 0.55, 0]} rotation={[0.38, 0.12, 0.1]}>
              <boxGeometry args={[size * 0.17, r * 0.88, 0.012]} />
              <meshStandardMaterial color="#2b2f38" roughness={0.45} />
            </mesh>
          </group>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[size * 0.14, size * 0.14, depth * 0.85, 24]} />
          <meshStandardMaterial color={accent} roughness={0.4} metalness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

/** Origin: first fan centre. Children carry per-fan offset and orientation. */
export function FanPackModel({ spec, items, spin }: { spec: FanSpec; items: { offset: Vec3; rotation: Vec3 }[]; spin: boolean }) {
  return (
    <group>
      {items.map((it, i) => (
        <group key={i} position={it.offset} rotation={it.rotation}>
          <FanUnit size={spec.sizeMm * MM} frame={spec.visual.color} accent={spec.visual.accent} rgb={spec.rgb} spin={spin} />
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ case */

/** Origin: floor centre of the case. +x front, +z glass side. */
export function CaseModel({ spec, mode }: { spec: CaseSpec; mode: CaseMode }) {
  const g = caseGeometry(spec);
  const { width: W, height: H, depth: D, wall } = g;
  const body = spec.visual.color;
  const accent = spec.visual.accent ?? "#2b2f36";
  const light = spec.visual.color.toLowerCase() > "#888888";
  const interior = light ? "#c9ccd4" : "#0d0f14";
  const inset = light ? "#9da1aa" : "#07080a";
  const shroudLen = D - 0.7;
  const bezel = 0.08;
  const frontX = D / 2 - wall / 2;
  // Rear exhaust area beside the I/O cut-out, clamped for narrow cases.
  const rearFan = Math.min(1.1, W - 0.6 - 0.45);
  const rearFanZ = g.trayZ + 0.4 + rearFan / 2;
  const grommetX = g.boardOrigin[0] + 2.62;
  // Slot covers stop above the floor even for cases with many slots.
  const slotCovers = Math.min(spec.expansionSlots, Math.floor((g.boardOrigin[1] - 1.45 - 0.15) / SLOT_PITCH) + 1);
  return (
    <group>
      {/* shell: floor, top, rear, side (tray side) */}
      <Box size={[D, wall, W]} position={[0, wall / 2, 0]} color={body} roughness={0.55} metalness={0.35} />
      <Box size={[D, wall, W]} position={[0, H - wall / 2, 0]} color={body} roughness={0.55} metalness={0.35} />
      <Box size={[wall, H, W]} position={[-D / 2 + wall / 2, H / 2, 0]} color={body} roughness={0.55} metalness={0.35} />
      <Box size={[D, H, wall]} position={[0, H / 2, -W / 2 + wall / 2]} color={body} roughness={0.55} metalness={0.35} />

      {/* top dust filter over the fan mounts */}
      <Box size={[D * 0.62, 0.006, W - 0.5]} position={[-D * 0.08, H + 0.003, 0]} color={inset} />
      <Perforated size={[D * 0.62, W - 0.5]} position={[-D * 0.08, H + 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]} color={body} pitch={0.05} />
      {/* front I/O: power button + USB */}
      <Cyl r={0.06} h={0.02} position={[D / 2 - 0.35, H + 0.012, W / 2 - 0.35]} axis="y" color={accent} metalness={0.6} roughness={0.3} />
      {[0, 1].map((i) => (
        <Box key={i} size={[0.05, 0.012, 0.14]} position={[D / 2 - 0.35, H + 0.006, W / 2 - 0.62 - i * 0.22]} color={PLASTIC} />
      ))}

      {/* front panel */}
      {spec.style === "compact" ? (
        <>
          <Box size={[wall, H, W]} position={[frontX, H / 2, 0]} color={body} roughness={0.8} />
          {[-1, 1].map((s) => (
            <Perforated key={s} size={[0.22, H - 0.4]} position={[D / 2 + 0.002, H / 2, s * (W / 2 - 0.2)]} rotation={[0, Math.PI / 2, 0]} color={accent} pitch={0.045} />
          ))}
        </>
      ) : (
        <>
          {/* bezel frame */}
          <Box size={[wall, bezel, W]} position={[frontX, H - bezel / 2, 0]} color={body} />
          <Box size={[wall, bezel, W]} position={[frontX, bezel / 2, 0]} color={body} />
          <Box size={[wall, H, bezel]} position={[frontX, H / 2, W / 2 - bezel / 2]} color={body} />
          <Box size={[wall, H, bezel]} position={[frontX, H / 2, -W / 2 + bezel / 2]} color={body} />
          {spec.style === "mesh" ? (
            <Perforated
              size={[W - bezel * 2, H - bezel * 2]}
              position={[frontX + 0.01, H / 2, 0]}
              rotation={[0, Math.PI / 2, 0]}
              color={accent}
              pitch={0.055}
              metalness={0.5}
              roughness={0.5}
            />
          ) : (
            <>
              {/* panoramic "aquarium" front: clear glass, the interior stays visible */}
              <Glass size={[0.04, H - bezel * 2, W - bezel * 2]} position={[D / 2 - 0.02, H / 2, 0]} opacity={mode === "solid" ? 0.3 : 0.06} />
            </>
          )}
        </>
      )}

      {/* rear: I/O cut-out, exhaust grille, PSU opening */}
      <Box size={[0.004, 1.3, 0.3]} position={[-D / 2 - 0.002, g.boardOrigin[1] - 0.75, g.trayZ + 0.17]} color={inset} />
      {rearFan > 0.5 && (
        <>
          <Box size={[0.004, rearFan, rearFan]} position={[-D / 2 - 0.002, H - 0.4 - rearFan / 2, rearFanZ]} color={inset} />
          <Perforated size={[rearFan, rearFan]} position={[-D / 2 - 0.006, H - 0.4 - rearFan / 2, rearFanZ]} rotation={[0, -Math.PI / 2, 0]} color={body} pitch={0.06} />
        </>
      )}

      {/* dual-chamber: perforated floor under the bottom intake fans */}
      {g.dualChamber && (
        <>
          <Box size={[D - 0.5, 0.004, W / 2 - wall - g.trayZ - 0.1]} position={[0.05, wall + 0.002, (W / 2 - wall + g.trayZ) / 2]} color={inset} />
          <Perforated
            size={[D - 0.5, W / 2 - wall - g.trayZ - 0.1]}
            position={[0.05, wall + 0.006, (W / 2 - wall + g.trayZ) / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            color={body}
            pitch={0.05}
          />
        </>
      )}

      {/* motherboard tray with cable-routing grommets */}
      <Box size={[D - 0.2, H - 0.2, 0.01]} position={[0, H / 2, g.trayZ - 0.03]} color={interior} roughness={0.85} />
      {D / 2 - grommetX > 0.55 &&
        [0.6, 1.5, 2.3].map((dy) => <Box key={dy} size={[0.12, 0.5, 0.014]} position={[grommetX, g.boardOrigin[1] - dy, g.trayZ - 0.02]} color="#1f2228" roughness={0.95} />)}
      <Box size={[0.6, 0.1, 0.014]} position={[g.boardOrigin[0] + 0.55, H - 0.17, g.trayZ - 0.02]} color="#1f2228" roughness={0.95} />

      {/* rear expansion slot covers with vent slits */}
      {Array.from({ length: slotCovers }, (_, i) => (
        <group key={i}>
          <Box
            size={[0.012, 0.16, 1.1]}
            position={[-D / 2 + wall + 0.01, g.boardOrigin[1] - 1.55 - i * SLOT_PITCH + 0.1, g.trayZ + 0.62]}
            color={light ? "#b9bcc4" : "#20232a"}
            metalness={0.6}
            roughness={0.4}
          />
          <Box size={[0.014, 0.05, 0.7]} position={[-D / 2 + wall + 0.01, g.boardOrigin[1] - 1.55 - i * SLOT_PITCH + 0.1, g.trayZ + 0.62]} color={inset} />
        </group>
      ))}

      {/* PSU shroud (none in compact cases) */}
      {g.shroudHeight > 0 && (
        <>
          <Box size={[shroudLen, wall, W - wall * 2]} position={[-D / 2 + shroudLen / 2, g.shroudHeight, 0]} color={body} />
          <Box size={[shroudLen, g.shroudHeight, wall]} position={[-D / 2 + shroudLen / 2, g.shroudHeight / 2, W / 2 - wall * 1.5]} color={body} />
          <Box size={[0.9, g.shroudHeight * 0.5, 0.004]} position={[-D / 2 + shroudLen - 0.6, g.shroudHeight / 2, W / 2 - wall + 0.002]} color={inset} />
          <Perforated size={[0.9, g.shroudHeight * 0.5]} position={[-D / 2 + shroudLen - 0.6, g.shroudHeight / 2, W / 2 - wall + 0.006]} color={body} pitch={0.045} />
        </>
      )}

      {/* side panel: tempered glass (4 mm) with a black frit border, or a steel panel */}
      {mode === "solid" && <Box size={[D, H, 0.02]} position={[0, H / 2, W / 2 - 0.01]} color={body} roughness={0.6} metalness={0.35} />}
      {mode === "glass" && (
        <group>
          <Glass size={[D, H, 0.04]} position={[0, H / 2, W / 2]} />
          {/* frit border hides the panel edges like real tinted glass */}
          <Box size={[D, 0.07, 0.004]} position={[0, H - 0.035, W / 2 + 0.021]} color="#050608" roughness={0.2} />
          <Box size={[D, 0.07, 0.004]} position={[0, 0.035, W / 2 + 0.021]} color="#050608" roughness={0.2} />
          <Box size={[0.07, H, 0.004]} position={[-D / 2 + 0.035, H / 2, W / 2 + 0.021]} color="#050608" roughness={0.2} />
          <Box size={[0.07, H, 0.004]} position={[D / 2 - 0.035, H / 2, W / 2 + 0.021]} color="#050608" roughness={0.2} />
        </group>
      )}
      {/* thumbscrews on the rear holding the side panel */}
      {mode !== "open" &&
        [0.2, 0.8].map((f) => <Cyl key={f} r={0.035} h={0.05} position={[-D / 2 - 0.025, H * f, W / 2 - 0.06]} axis="x" color={NICKEL} metalness={0.85} roughness={0.3} />)}

      <CaseFeet spec={spec} />
    </group>
  );
}

/** Brushed metal of the feet: lighter than the case so they read against a dark podium. */
const FEET_METAL = "#4a4f5a";

function CaseFeet({ spec }: { spec: CaseSpec }) {
  const { width: W, depth: D } = caseGeometry(spec);
  const { kind, height: h } = caseFeet(spec);
  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx, sz] as const));
  if (kind === "rails") {
    // Two rails front-to-back with rubber end caps.
    return (
      <group>
        {[-1, 1].map((sz) => (
          <group key={sz} position={[0, -h / 2, sz * (W / 2 - 0.28)]}>
            <Box size={[D - 0.3, h * 0.72, 0.22]} position={[0, h * 0.14, 0]} color={FEET_METAL} metalness={0.75} roughness={0.3} />
            {[-1, 1].map((sx) => (
              <Box key={sx} size={[0.32, h * 0.3, 0.24]} position={[sx * (D / 2 - 0.32), -h * 0.35, 0]} color="#0b0c0f" roughness={0.95} />
            ))}
          </group>
        ))}
      </group>
    );
  }
  if (kind === "round") {
    return (
      <group>
        {corners.map(([sx, sz]) => (
          <Cyl key={`${sx}${sz}`} r={0.11} h={h} position={[sx * (D / 2 - 0.3), -h / 2, sz * (W / 2 - 0.25)]} axis="y" color={FEET_METAL} metalness={0.6} roughness={0.45} />
        ))}
      </group>
    );
  }
  // Tower: oval rubber pads on a short plastic base.
  return (
    <group>
      {corners.map(([sx, sz]) => (
        <group key={`${sx}${sz}`} position={[sx * (D / 2 - 0.45), 0, sz * (W / 2 - 0.3)]}>
          <Box size={[0.55, h * 0.55, 0.26]} position={[0, -h * 0.275, 0]} color={FEET_METAL} metalness={0.7} roughness={0.35} />
          <Box size={[0.48, h * 0.45, 0.2]} position={[0, -h * 0.775, 0]} color="#0b0c0f" roughness={0.95} />
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ motherboard */

/** Origin: top-rear corner of the PCB on the component side (board-local layout space). */
export function MotherboardModel({ spec }: { spec: MotherboardSpec }) {
  const L = BOARD_LAYOUTS[spec.formFactor];
  const accent = spec.visual.accent ?? STEEL;
  const intel = spec.socket.startsWith("LGA");
  const [cx, cy] = L.cpu;
  const [sw, sh] = intel ? [0.5, 0.6] : [0.6, 0.6];
  const ioH = Math.min(1.25, L.height * 0.45);
  const ioPorts = Math.floor((ioH - 0.2) / 0.18);
  return (
    <group>
      <Box size={[L.width, L.height, BOARD_THICKNESS]} position={[L.width / 2, -L.height / 2, -BOARD_THICKNESS / 2]} color={spec.visual.color} roughness={0.8} />
      {/* mounting holes */}
      {[
        [0.2, -0.2],
        [L.width - 0.2, -0.2],
        [0.2, -L.height + 0.2],
        [L.width - 0.2, -L.height + 0.2],
      ].map(([x, y]) => (
        <Cyl key={`${x}${y}`} r={0.045} h={0.004} position={[x, y, 0.002]} color={NICKEL} metalness={0.8} roughness={0.3} />
      ))}

      {/* socket: housing, retention frame and lever */}
      <Box size={[sw, sh, 0.03]} position={[cx, cy, 0.015]} color="#2a2d33" metalness={0.4} />
      <Box size={[sw + 0.06, sh + 0.06, 0.012]} position={[cx, cy, 0.006]} color={STEEL} metalness={0.7} roughness={0.35} />
      {[-1, 1].map((s) => (
        <Box key={`fy${s}`} size={[sw + 0.06, 0.03, 0.02]} position={[cx, cy + s * (sh / 2 + 0.015), 0.03]} color={STEEL} metalness={0.8} roughness={0.3} />
      ))}
      {[-1, 1].map((s) => (
        <Box key={`fx${s}`} size={[0.03, sh + 0.06, 0.02]} position={[cx + s * (sw / 2 + 0.015), cy, 0.03]} color={STEEL} metalness={0.8} roughness={0.3} />
      ))}
      <Cyl r={0.012} h={sh + 0.04} position={[cx + sw / 2 + 0.06, cy, 0.03]} axis="y" color={NICKEL} metalness={0.85} roughness={0.25} />

      {/* VRM: capacitors and heatsinks */}
      {Array.from({ length: 7 }, (_, i) => (
        <Cyl key={`cap${i}`} r={0.028} h={0.07} position={[cx - 0.36 + i * 0.12, cy + 0.42, 0.035]} color="#2d2f35" metalness={0.6} roughness={0.35} />
      ))}
      <Box size={[1.0, 0.28, 0.22]} position={[cx, cy + 0.6, 0.11]} color={accent} metalness={0.55} roughness={0.4} />
      <Box size={[0.28, 1.05, 0.22]} position={[Math.max(0.2, cx - 0.6), cy - 0.05, 0.11]} color={accent} metalness={0.55} roughness={0.4} />
      {[-0.3, -0.1, 0.1, 0.3].map((dx) => (
        <Box key={`vg${dx}`} size={[0.08, 0.29, 0.02]} position={[cx + dx, cy + 0.6, 0.215]} color="#0d0e11" />
      ))}

      {/* rear I/O shroud with port faces on the rear edge */}
      <Box size={[0.3, ioH, 0.32]} position={[0.15, -ioH / 2 - 0.1, 0.16]} color="#1b1d22" metalness={0.3} />
      {Array.from({ length: ioPorts }, (_, i) => {
        const y = -0.22 - i * 0.18;
        const kind = i % 3;
        return kind === 0 ? (
          <group key={i}>
            <Box size={[0.012, 0.13, 0.05]} position={[-0.004, y, 0.1]} color="#1f4fd1" />
            <Box size={[0.012, 0.13, 0.05]} position={[-0.004, y, 0.2]} color="#1f4fd1" />
          </group>
        ) : kind === 1 ? (
          <group key={i}>
            <Box size={[0.012, 0.13, 0.05]} position={[-0.004, y, 0.1]} color="#0b0c0f" />
            <Box size={[0.012, 0.14, 0.12]} position={[-0.004, y, 0.24]} color="#0b0c0f" />
          </group>
        ) : (
          <group key={i}>
            {["#36b37e", "#e46aa0", "#4aa8ff"].map((c, k) => (
              <Cyl key={c} r={0.025} h={0.012} position={[-0.004, y, 0.08 + k * 0.08]} axis="x" color={c} />
            ))}
          </group>
        );
      })}

      {/* DIMM slots with latches */}
      {L.dimms.slice(0, spec.memorySlots).map(([x, y], i) => (
        <group key={i}>
          <Box size={[0.06, DIMM_LENGTH + 0.05, 0.08]} position={[x, y, 0.04]} color={i % 2 ? "#2a2d35" : "#15171c"} />
          <Box size={[0.07, 0.06, 0.1]} position={[x, y + DIMM_LENGTH / 2 + 0.05, 0.05]} color="#2c2f37" />
          <Box size={[0.07, 0.04, 0.09]} position={[x, y - DIMM_LENGTH / 2 - 0.04, 0.045]} color="#2c2f37" />
        </group>
      ))}

      {/* PCIe slots: primary x16 is steel-reinforced */}
      <Box size={[PCIE_SLOT_RANGE[1] - PCIE_SLOT_RANGE[0], 0.075, 0.1]} position={[(PCIE_SLOT_RANGE[0] + PCIE_SLOT_RANGE[1]) / 2, L.pcie[1], 0.05]} color="#1a1c21" />
      <Box
        size={[PCIE_SLOT_RANGE[1] - PCIE_SLOT_RANGE[0] + 0.02, 0.09, 0.03]}
        position={[(PCIE_SLOT_RANGE[0] + PCIE_SLOT_RANGE[1]) / 2, L.pcie[1], 0.1]}
        color={STEEL}
        metalness={0.8}
        roughness={0.3}
      />
      <Box size={[0.05, 0.08, 0.1]} position={[PCIE_SLOT_RANGE[1] + 0.05, L.pcie[1], 0.05]} color="#2c2f37" />
      {spec.formFactor !== "ITX" && [3, 5].map((n) => <Box key={n} size={[0.89, 0.06, 0.08]} position={[0.865, L.pcie[1] - n * SLOT_PITCH, 0.04]} color="#1a1c21" />)}

      {/* M.2 sockets and standoffs */}
      {L.m2.slice(0, spec.m2Slots).map(([x, y], i) => (
        <group key={i}>
          <Box size={[0.06, 0.24, 0.05]} position={[x - 0.02, y, 0.025]} color="#24262c" />
          <Cyl r={0.025} h={0.03} position={[x + 0.8, y, 0.015]} color={GOLD} metalness={0.8} roughness={0.3} />
        </group>
      ))}

      {/* chipset heatsink */}
      <Box size={[0.55, 0.5, 0.1]} position={[L.chipset[0], L.chipset[1], 0.05]} color={accent} metalness={0.5} roughness={0.35} />
      <Box size={[0.4, 0.06, 0.012]} position={[L.chipset[0], L.chipset[1] + 0.1, 0.106]} color="#0d0e11" />

      {/* SATA ports along the right edge */}
      {spec.formFactor !== "ITX" &&
        Array.from({ length: Math.min(4, spec.sataPorts) }, (_, i) => (
          <Box key={i} size={[0.1, 0.07, 0.06]} position={[L.width - 0.07, -L.height * 0.68 - i * 0.1, 0.03]} color="#191a1f" />
        ))}
      {/* bottom-edge headers (front panel, USB, fans) */}
      {[0.6, 1.0, 1.4, 1.9]
        .filter((x) => x < L.width - 0.15)
        .map((x) => (
          <Box key={x} size={[0.2, 0.06, 0.07]} position={[x, -L.height + 0.07, 0.035]} color="#16171b" />
        ))}

      {/* 24-pin ATX power */}
      <Box size={[0.14, 0.55, 0.18]} position={[L.width - 0.1, -1.0, 0.09]} color={PLASTIC} />
      {/* 8-pin EPS */}
      <Box size={[0.3, 0.12, 0.16]} position={[0.75, -0.1, 0.08]} color={PLASTIC} />
    </group>
  );
}

/* ------------------------------------------------------------------ cpu */

/** Origin: socket centre on the board surface. IHS shape follows the socket family (generic). */
export function CpuModel({ spec }: { spec: CpuSpec }) {
  const intel = spec.socket.startsWith("LGA");
  const [w, h] = intel ? [0.375, 0.45] : [0.4, 0.4];
  const ihs = spec.visual.color;
  const metal = { color: ihs, metalness: 0.88, roughness: 0.26 };
  return (
    <group>
      {/* substrate */}
      <Box size={[w, h, 0.03]} position={[0, 0, 0.03]} color={spec.socket === "AM4" || spec.socket === "AM3+" ? "#1d5a3a" : "#1d4d3a"} roughness={0.7} />
      {spec.socket === "AM5" ? (
        <>
          {/* AM5: central body with cut-outs on two sides exposing capacitors */}
          <Box size={[w * 0.62, h * 0.86, 0.03]} position={[0, 0, 0.06]} {...metal} />
          {[-1, 1].flatMap((sx) => [-1, 1].map((sy) => <Box key={`${sx}${sy}`} size={[w * 0.13, h * 0.24, 0.03]} position={[sx * w * 0.375, sy * h * 0.31, 0.06]} {...metal} />))}
          {[-1, 1].flatMap((sx) =>
            [-0.06, 0, 0.06].map((dy) => <Box key={`c${sx}${dy}`} size={[0.02, 0.03, 0.012]} position={[sx * w * 0.37, dy, 0.051]} color="#c9b48a" metalness={0.6} />),
          )}
        </>
      ) : intel ? (
        <>
          {/* LGA: wider centre with stepped edges */}
          <Box size={[w * 0.86, h * 0.62, 0.03]} position={[0, 0, 0.06]} {...metal} />
          <Box size={[w * 0.66, h * 0.82, 0.03]} position={[0, 0, 0.06]} {...metal} />
        </>
      ) : (
        <Box size={[w * 0.86, h * 0.86, 0.03]} position={[0, 0, 0.06]} {...metal} />
      )}
      {/* pin-1 marker */}
      <Box size={[0.03, 0.03, 0.004]} position={[-w / 2 + 0.03, -h / 2 + 0.03, 0.047]} color={GOLD} metalness={0.8} />
    </group>
  );
}

/* ------------------------------------------------------------------ cooler */

function FinStack({ size, position, color }: { size: Vec3; position: Vec3; color: string }) {
  const [sx, sy, sz] = size;
  const count = Math.max(8, Math.round(sz / 0.045));
  const matrices = useMemo(() => {
    const m = new THREE.Matrix4();
    return Array.from({ length: count }, (_, i) => m.clone().makeTranslation(0, 0, -sz / 2 + (i + 0.5) * (sz / count)));
  }, [count, sz]);
  return (
    <group position={position}>
      <instancedMesh
        ref={(mesh) => {
          if (mesh) {
            matrices.forEach((mat, i) => mesh.setMatrixAt(i, mat));
            mesh.instanceMatrix.needsUpdate = true;
          }
        }}
        args={[undefined, undefined, count]}
      >
        <boxGeometry args={[sx, sy, 0.012]} />
        <meshStandardMaterial color={color} metalness={0.75} roughness={0.32} />
      </instancedMesh>
    </group>
  );
}

/** U-shaped heat pipe in the xz plane: up from the base on both sides of a tower. */
function HeatPipe({ halfSpan, height, y }: { halfSpan: number; height: number; y: number }) {
  const curve = useMemo(() => {
    const p = new THREE.CurvePath<THREE.Vector3>();
    const r = Math.min(0.12, halfSpan * 0.6);
    const base = 0.05;
    p.add(new THREE.LineCurve3(new THREE.Vector3(-halfSpan, y, height), new THREE.Vector3(-halfSpan, y, base + r)));
    p.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-halfSpan, y, base + r), new THREE.Vector3(-halfSpan, y, base), new THREE.Vector3(-halfSpan + r, y, base)));
    p.add(new THREE.LineCurve3(new THREE.Vector3(-halfSpan + r, y, base), new THREE.Vector3(halfSpan - r, y, base)));
    p.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(halfSpan - r, y, base), new THREE.Vector3(halfSpan, y, base), new THREE.Vector3(halfSpan, y, base + r)));
    p.add(new THREE.LineCurve3(new THREE.Vector3(halfSpan, y, base + r), new THREE.Vector3(halfSpan, y, height)));
    return p;
  }, [halfSpan, height, y]);
  return (
    <mesh>
      <tubeGeometry args={[curve, 48, 0.03, 10, false]} />
      <meshStandardMaterial color={COPPER} metalness={0.9} roughness={0.28} />
    </mesh>
  );
}

/** Origin: top of the CPU heat spreader. Radiator offset is relative to this origin (AIO only). */
export function CoolerModel({ spec, radiator, spin }: { spec: CoolerSpec; radiator?: Pose; spin: boolean }) {
  const H = spec.heightMm * MM;
  const accent = spec.visual.accent ?? DARK;
  if (spec.kind === "aio") {
    return (
      <group>
        {/* pump block: cold plate, housing, cap */}
        <Box size={[0.42, 0.42, 0.03]} position={[0, 0, 0.015]} color={COPPER} metalness={0.85} roughness={0.3} />
        <mesh position={[0, 0, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.32, 0.34, 0.42, 40]} />
          <meshStandardMaterial color={spec.visual.color} roughness={0.45} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0.455]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.3, 0.32, 0.02, 40]} />
          <meshStandardMaterial color={PLASTIC} roughness={0.15} metalness={0.2} />
        </mesh>
        {/* trim ring (no lighting is assumed; the spec has no RGB data for coolers) */}
        <mesh position={[0, 0, 0.47]}>
          <torusGeometry args={[0.26, 0.012, 8, 48]} />
          <meshStandardMaterial color={accent} metalness={0.7} roughness={0.3} />
        </mesh>
        {/* tube fittings */}
        {[0.08, -0.08].map((dy) => (
          <Cyl key={dy} r={0.045} h={0.08} position={[0.28, dy, 0.32]} axis="x" color={PLASTIC} />
        ))}
        {radiator && <AioRadiator pose={radiator} spec={spec} spin={spin} />}
      </group>
    );
  }
  if (H < 0.6) {
    // Low-profile / top-flow cooler.
    return (
      <group>
        <Box size={[0.45, 0.45, 0.06]} position={[0, 0, 0.03]} color={COPPER} metalness={0.8} roughness={0.3} />
        <FinStack size={[0.95, 0.95, 0.16]} position={[0, 0, 0.14]} color={STEEL} />
        <group position={[0, 0, 0.3]} scale={0.77}>
          <FanUnit frame={accent} accent={spec.visual.color} spin={spin} depth={0.14} />
        </group>
      </group>
    );
  }
  const dual = spec.heightMm >= 155 && !spec.id.includes("ak400");
  const stackW = dual ? 0.42 : 0.55;
  const stacks: number[] = dual ? [-0.3, 0.3] : [0];
  const finZ = 0.3 + (H - 0.38) / 2;
  const pipeTop = H - 0.04;
  return (
    <group>
      {/* nickel-plated base with copper contact */}
      <Box size={[0.4, 0.4, 0.02]} position={[0, 0, 0.01]} color={COPPER} metalness={0.85} roughness={0.25} />
      <Box size={[0.44, 0.4, 0.06]} position={[0, 0, 0.05]} color={NICKEL} metalness={0.85} roughness={0.25} />
      {/* heat pipes: U-bends through the base into the fin stack(s) */}
      {[-0.12, -0.04, 0.04, 0.12].map((y, i) => (
        <HeatPipe key={y} halfSpan={dual ? (i % 2 ? 0.24 : 0.36) : i % 2 ? 0.12 : 0.2} height={pipeTop} y={y} />
      ))}
      {stacks.map((x) => (
        <FinStack key={x} size={[stackW, 1.25, H - 0.38]} position={[x, 0, finZ]} color={spec.visual.color} />
      ))}
      {stacks.map((x) => (
        <Box key={`cap${x}`} size={[stackW + 0.02, 1.27, 0.05]} position={[x, 0, H - 0.05]} color={accent} metalness={0.4} />
      ))}
      {/* fan with steel wire clips */}
      <group position={[dual ? 0 : stackW / 2 + 0.14, 0, finZ]} rotation={[0, Math.PI / 2, 0]}>
        <FanUnit frame={accent} accent={spec.visual.color} spin={spin} />
        {[-1, 1].map((s) => (
          <Box key={s} size={[0.01, 0.01, 0.3]} position={[0, s * 0.58, -0.12]} color={NICKEL} metalness={0.9} roughness={0.3} />
        ))}
      </group>
    </group>
  );
}

/**
 * Radiator centred on pose.position, length along local y, fans on local -x (toward the case
 * interior for the default front orientation). Tubes run from the pump to the end tank.
 */
function AioRadiator({ pose, spec, spin }: { pose: Pose; spec: CoolerSpec; spin: boolean }) {
  const size = spec.radiatorMm ?? 360;
  const fanSize = radiatorFanSize(size) * MM;
  const fans = Math.max(1, Math.round(size / radiatorFanSize(size)));
  const len = size * MM + 0.32;
  const width = fanSize + 0.04;
  const fins = usePattern("fins", 1, Math.round(len / 0.03));
  const [ox, oy, oz] = pose.position;
  const [rx, ry, rz] = pose.rotation;
  const tubes = useMemo(() => {
    const euler = new THREE.Euler(rx, ry, rz);
    const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyEuler(euler).add(new THREE.Vector3(ox, oy, oz));
    const mk = (dy: number) => {
      // Inlet on the glass-facing edge of the upper end tank.
      const inlet = at(0, len / 2 - 0.18 + dy, width / 2 + 0.02);
      return new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.3, dy, 0.32),
        new THREE.Vector3(0.7, dy * 2, 0.75),
        inlet
          .clone()
          .add(new THREE.Vector3(0, 0, 0.14))
          .lerp(new THREE.Vector3(0.7, dy * 2, 0.75), 0.35),
        inlet,
      ]);
    };
    return [mk(0.08), mk(-0.08)];
  }, [ox, oy, oz, rx, ry, rz, len, width]);
  return (
    <group>
      <group position={pose.position} rotation={pose.rotation}>
        {/* fin core between two end tanks */}
        <mesh>
          <boxGeometry args={[0.27, len - 0.3, width - 0.02]} />
          <meshStandardMaterial color={spec.visual.color} map={fins} metalness={0.5} roughness={0.55} />
        </mesh>
        {[-1, 1].map((s) => (
          <Box key={s} size={[0.28, 0.15, width]} position={[0, s * (len / 2 - 0.075), 0]} color={PLASTIC} roughness={0.6} />
        ))}
        {Array.from({ length: fans }, (_, i) => (
          <group key={i} position={[-0.27, (i - (fans - 1) / 2) * fanSize, 0]} rotation={[0, Math.PI / 2, 0]}>
            <FanUnit size={fanSize} frame={spec.visual.accent ?? DARK} spin={spin} />
          </group>
        ))}
      </group>
      {tubes.map((curve, i) => (
        <mesh key={i}>
          <tubeGeometry args={[curve, 48, 0.035, 8, false]} />
          <meshStandardMaterial color={PLASTIC} roughness={0.75} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ memory */

/** Key-notch offset from the module centre along its length, per generation (approximate). */
const DIMM_NOTCH: Record<RamSpec["type"], number> = {
  DDR3: -0.13,
  DDR4: 0.04,
  DDR5: 0.0,
};

/** Origin: centre of the first used DIMM slot on the board surface. Light bar only if spec.rgb. */
export function RamModel({ spec, items }: { spec: RamSpec; items: { offset: Vec3 }[] }) {
  const h = spec.heightMm * MM;
  const accent = spec.visual.accent ?? DARK;
  const bare = spec.heightMm <= 31.5;
  const notch = DIMM_NOTCH[spec.type];
  const contactL = DIMM_LENGTH - 0.1;
  const left = contactL / 2 + notch - 0.015;
  const right = contactL / 2 - notch - 0.015;
  return (
    <group>
      {items.map((it, i) => (
        <group key={i} position={it.offset}>
          {/* PCB and gold fingers split by the key notch */}
          <Box size={[0.025, DIMM_LENGTH, h - 0.02]} position={[0, 0, (h - 0.02) / 2 + 0.02]} color="#1d4d3a" />
          <Box size={[0.03, left, 0.02]} position={[0, -contactL / 2 + left / 2, 0.01]} color={GOLD} metalness={0.9} roughness={0.3} />
          <Box size={[0.03, right, 0.02]} position={[0, contactL / 2 - right / 2, 0.01]} color={GOLD} metalness={0.9} roughness={0.3} />
          {bare ? (
            // No heat spreader: visible memory packages on both sides.
            [-1, 1].flatMap((s) =>
              Array.from({ length: 4 }, (_, k) => (
                <Box key={`${s}${k}`} size={[0.012, 0.22, 0.12]} position={[s * 0.019, -0.48 + k * 0.32, h * 0.55]} color="#0e0f12" roughness={0.5} />
              )),
            )
          ) : (
            <>
              {/* two-piece heat spreader with a top ridge */}
              {[-1, 1].map((s) => (
                <Box
                  key={s}
                  size={[0.018, DIMM_LENGTH - 0.03, h - 0.07]}
                  position={[s * 0.026, 0, (h - 0.07) / 2 + 0.05]}
                  color={spec.visual.color}
                  metalness={0.6}
                  roughness={0.35}
                />
              ))}
              <Box size={[0.072, DIMM_LENGTH - 0.03, 0.03]} position={[0, 0, h - 0.025]} color={spec.rgb ? spec.visual.color : accent} metalness={0.55} roughness={0.4} />
              {spec.rgb && <Box size={[0.06, DIMM_LENGTH - 0.08, 0.04]} position={[0, 0, h + 0.005]} color="#eceef5" emissive={accent} emissiveIntensity={1.3} roughness={0.6} />}
            </>
          )}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ gpu */

/** Height of the PCIe slot housing; the card body rests on it. */
export const GPU_SEAT_Z = 0.09;

export function gpuDims(spec: GpuSpec) {
  const L = spec.lengthMm * MM;
  const T = spec.slots * SLOT_PITCH;
  const Hc = spec.slots >= 3 ? 1.4 : 1.2;
  return { L, T, Hc };
}

const POWER_WIDTH: Record<GpuSpec["powerConnectors"][number]["type"], number> = { "6pin": 0.16, "8pin": 0.21, "12V-2x6": 0.19 };

/** Radial blower fan (axis y), for single-fan reference designs. */
function BlowerFan({ r }: { r: number }) {
  return (
    <group>
      {Array.from({ length: 24 }, (_, k) => (
        <group key={k} rotation={[0, (k / 24) * Math.PI * 2, 0]}>
          <mesh position={[r * 0.68, 0, 0]} rotation={[0, 0.5, 0]}>
            <boxGeometry args={[r * 0.5, 0.06, 0.012]} />
            <meshStandardMaterial color="#1c1e24" roughness={0.5} />
          </mesh>
        </group>
      ))}
      <mesh>
        <cylinderGeometry args={[r * 0.38, r * 0.38, 0.07, 24]} />
        <meshStandardMaterial color="#2a2d34" metalness={0.4} />
      </mesh>
    </group>
  );
}

/**
 * Origin: PCIe slot line at the board's rear edge, on the board surface.
 * +x along the card toward the case front, -y is the cooler side, +z away from the board.
 * Fan count and lighting come from the spec (generic partner layouts are template values).
 */
export function GpuModel({ spec, spin }: { spec: GpuSpec; spin: boolean }) {
  const { L, T, Hc } = gpuDims(spec);
  const accent = spec.visual.accent ?? STEEL;
  const fanCount = spec.fans ?? (L > 2.6 ? 3 : 2);
  // A single fan on a full-length card is a blower; on a short card it is an axial fan.
  const blower = fanCount === 1 && L > 2.2;
  const fanR = Math.min(0.48, Hc / 2 - 0.06, (L - 0.3) / fanCount / 2 - 0.04);
  const finDepth = blower ? 0 : Math.min(0.24, (T - 0.05) * 0.42);
  const shroudT = T - 0.05 - finDepth;
  const fanX = (i: number) => (blower ? L - 0.5 : 0.15 + ((L - 0.3) / fanCount) * (i + 0.5));
  const rgb = Boolean(spec.rgb);
  const blades = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spin && blades.current) blades.current.children.forEach((c) => (c.rotation.y += dt * 8));
  });
  const connectors = spec.powerConnectors.flatMap((p) => Array.from({ length: p.count }, () => p.type));
  const connStart = blower ? L - 0.25 - connectors.reduce((s, t) => s + POWER_WIDTH[t] + 0.03, 0) : L * 0.55;
  const connX = connectors.map((t, i) => connStart + connectors.slice(0, i).reduce((s, p) => s + POWER_WIDTH[p] + 0.03, 0) + POWER_WIDTH[t] / 2);
  return (
    // Card body starts at the slot's top edge; only the edge connector reaches into the slot.
    <group position={[0, 0, GPU_SEAT_Z]}>
      {/* PCB + backplate */}
      <Box size={[L - 0.05, 0.02, Hc - 0.05]} position={[L / 2, 0.01, Hc / 2]} color="#16301f" />
      <Box size={[L - 0.05, 0.02, Hc - 0.05]} position={[L / 2, 0.035, Hc / 2]} color="#1c1e23" metalness={0.6} roughness={0.4} />
      {[0.3, 0.5, 0.7].map((f) => (
        <Box key={f} size={[L * 0.25, 0.004, 0.03]} position={[L * f + 0.2, 0.047, Hc * 0.75]} color="#0b0c0e" />
      ))}

      {/* heatsink fins visible between the PCB and the shroud */}
      {finDepth > 0 && (
        <group position={[L / 2, -finDepth / 2, Hc / 2]} rotation={[0, Math.PI / 2, 0]}>
          <FinStack size={[Hc - 0.12, finDepth, L - 0.2]} position={[0, 0, 0]} color="#8e939c" />
        </group>
      )}

      {/* shroud */}
      <Box size={[L, shroudT, Hc]} position={[L / 2, -finDepth - shroudT / 2, Hc / 2 + 0.005]} color={spec.visual.color} metalness={0.5} roughness={0.42} />
      {/* top-edge trim: lit only on lines that actually have RGB */}
      <Box
        size={[L * 0.6, 0.025, 0.02]}
        position={[L * 0.45, -finDepth - shroudT * 0.5, Hc + 0.015]}
        color={accent}
        emissive={rgb ? accent : undefined}
        emissiveIntensity={rgb ? 1.2 : 0}
        metalness={rgb ? 0.1 : 0.6}
        roughness={0.35}
      />

      {blower ? (
        <>
          {/* blower intake with a recessed opening */}
          <Cyl r={fanR * 0.85} h={0.012} position={[fanX(0), -T + 0.045, Hc / 2]} axis="y" color="#060709" />
          <group ref={blades}>
            <group position={[fanX(0), -T + 0.03, Hc / 2]}>
              <BlowerFan r={fanR * 0.8} />
            </group>
          </group>
        </>
      ) : (
        <>
          <group ref={blades}>
            {Array.from({ length: fanCount }, (_, i) => (
              <group key={i} position={[fanX(i), -T + 0.03, Hc / 2]}>
                {Array.from({ length: 9 }, (_, k) => (
                  <mesh key={k} rotation={[0, (k / 9) * Math.PI * 2, 0.25]}>
                    <boxGeometry args={[0.05, 0.012, fanR * 1.85]} />
                    <meshStandardMaterial color="#20232a" />
                  </mesh>
                ))}
              </group>
            ))}
          </group>
          {Array.from({ length: fanCount }, (_, i) => (
            <group key={i} position={[fanX(i), -T + 0.02, Hc / 2]}>
              {/* opening, rim and hub */}
              <Cyl r={fanR + 0.01} h={0.01} position={[0, 0.02, 0]} axis="y" color="#07080a" />
              <mesh>
                <torusGeometry args={[fanR, 0.02, 8, 40]} />
                <meshStandardMaterial color={accent} emissive={rgb ? accent : undefined} emissiveIntensity={rgb ? 0.5 : 0} metalness={0.6} roughness={0.35} />
              </mesh>
              <mesh>
                <cylinderGeometry args={[fanR * 0.28, fanR * 0.28, 0.03, 24]} />
                <meshStandardMaterial color={accent} metalness={0.4} />
              </mesh>
            </group>
          ))}
        </>
      )}

      {/* I/O bracket: display outputs near the PCB, vent slits on the rest */}
      <Box size={[0.02, T + 0.06, 1.2]} position={[-0.01, -T / 2 + 0.03, 0.6]} color={STEEL} metalness={0.85} roughness={0.3} />
      {[0.25, 0.5, 0.75, 1.0].map((z, i) => (
        <Box key={z} size={[0.03, 0.08, i === 0 ? 0.17 : 0.15]} position={[-0.012, -0.07, z]} color="#0a0b0e" />
      ))}
      {T > 0.32 &&
        Array.from({ length: 6 }, (_, i) => <Box key={`v${i}`} size={[0.024, T - 0.26, 0.06]} position={[-0.012, -0.17 - (T - 0.26) / 2, 0.2 + i * 0.16]} color="#0a0b0e" />)}

      {/* PCIe edge connector with the key notch; sits inside the slot when installed */}
      <Box size={[0.115, 0.012, 0.09]} position={[PCIE_SLOT_RANGE[0] + 0.0575, 0.005, -0.045]} color={GOLD} metalness={0.9} roughness={0.25} />
      <Box
        size={[PCIE_SLOT_RANGE[1] - PCIE_SLOT_RANGE[0] - 0.135, 0.012, 0.09]}
        position={[(PCIE_SLOT_RANGE[0] + 0.135 + PCIE_SLOT_RANGE[1]) / 2, 0.005, -0.045]}
        color={GOLD}
        metalness={0.9}
        roughness={0.25}
      />

      {/* power connectors on the top edge, sized per connector type */}
      {connectors.map((type, i) => {
        const w = POWER_WIDTH[type];
        return (
          <group key={i} position={[connX[i], -0.04, Hc + 0.045]}>
            <Box size={[w, 0.1, 0.09]} color={PLASTIC} />
            <Box size={[w * 0.8, 0.07, 0.004]} position={[0, 0, 0.046]} color="#2b2e35" />
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ storage */

/** NVMe: origin at the connector end, stick extends +x. SATA/HDD: origin at a bottom corner. */
export function StorageModel({ spec }: { spec: StorageSpec }) {
  if (spec.formFactor === "3.5in") {
    // 3.5″ HDD: 147 × 26 × 102 mm, lying flat.
    return (
      <group>
        <Box size={[1.47, 0.26, 1.02]} position={[0.735, 0.13, 0.51]} color={spec.visual.color} metalness={0.75} roughness={0.35} />
        <Box size={[1.1, 0.005, 0.8]} position={[0.735, 0.262, 0.51]} color="#d9dce2" metalness={0.2} roughness={0.6} />
        {[
          [0.08, 0.08],
          [1.39, 0.08],
          [0.08, 0.94],
          [1.39, 0.94],
          [0.52, 0.51],
        ].map(([x, z]) => (
          <Cyl key={`${x}${z}`} r={0.025} h={0.01} position={[x, 0.262, z]} axis="y" color={STEEL} metalness={0.8} />
        ))}
        {/* SATA data + power */}
        <Box size={[0.02, 0.08, 0.16]} position={[1.475, 0.08, 0.3]} color={PLASTIC} />
        <Box size={[0.02, 0.08, 0.24]} position={[1.475, 0.08, 0.55]} color={PLASTIC} />
      </group>
    );
  }
  if (spec.interface === "SATA") {
    return (
      <group>
        <Box size={[1.0, 0.07, 0.7]} position={[0.5, 0.035, 0.35]} color={spec.visual.color} metalness={0.5} roughness={0.4} />
        <Box size={[0.5, 0.005, 0.35]} position={[0.5, 0.073, 0.35]} color={spec.visual.accent ?? STEEL} />
        <Box size={[0.02, 0.04, 0.16]} position={[1.005, 0.035, 0.22]} color={PLASTIC} />
        <Box size={[0.02, 0.04, 0.24]} position={[1.005, 0.035, 0.45]} color={PLASTIC} />
      </group>
    );
  }
  return (
    <group>
      <Box size={[0.8, 0.22, 0.016]} position={[0.4, 0, 0.008]} color="#141518" />
      {/* controller + NAND packages */}
      <Box size={[0.17, 0.16, 0.02]} position={[0.17, 0, 0.026]} color="#26282e" />
      <Box size={[0.24, 0.17, 0.02]} position={[0.4, 0, 0.026]} color="#26282e" />
      <Box size={[0.24, 0.17, 0.02]} position={[0.66, 0, 0.026]} color="#26282e" />
      <Box size={[0.5, 0.18, 0.003]} position={[0.45, 0, 0.038]} color={spec.visual.accent ?? STEEL} />
      {/* M-key fingers with notch, screw half-moon */}
      <Box size={[0.04, 0.05, 0.012]} position={[0.01, -0.075, 0.008]} color={GOLD} metalness={0.9} />
      <Box size={[0.04, 0.13, 0.012]} position={[0.01, 0.035, 0.008]} color={GOLD} metalness={0.9} />
      <Cyl r={0.03} h={0.017} position={[0.8, 0, 0.008]} color={GOLD} metalness={0.8} />
    </group>
  );
}

/* ------------------------------------------------------------------ psu */

export function psuDims(spec: PsuSpec) {
  return PSU_DIMENSIONS[spec.formFactor];
}

/** Origin: rear-bottom edge centre. Extends +x (depth), +y (height), ±z (width). Fan faces -y. */
export function PsuModel({ spec }: { spec: PsuSpec }) {
  const d = psuDims(spec);
  const sockets = spec.modular === "full" ? 8 : spec.modular === "semi" ? 4 : 0;
  return (
    <group>
      <Box size={[d.depth, d.height, d.width]} position={[d.depth / 2, d.height / 2, 0]} color={spec.visual.color} metalness={0.45} roughness={0.5} />
      {/* side label */}
      <Box size={[d.depth * 0.6, d.height * 0.45, 0.005]} position={[d.depth / 2, d.height / 2, d.width / 2 + 0.003]} color={spec.visual.accent ?? "#2a2c31"} />

      {/* fan grille on the underside */}
      <mesh position={[d.depth / 2, -0.003, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[d.width * 0.42, 40]} />
        <meshStandardMaterial color="#07080a" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[d.depth / 2, -0.004, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[d.width * 0.38, d.width * 0.42, 48]} />
        <meshStandardMaterial color={spec.visual.color} metalness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <Perforated size={[d.width * 0.76, d.width * 0.76]} position={[d.depth / 2, -0.006, 0]} rotation={[Math.PI / 2, 0, 0]} color={spec.visual.color} pitch={0.05} />

      {/* rear: exhaust grille, IEC inlet, switch */}
      <Box size={[0.004, d.height * 0.8, d.width * 0.5]} position={[-0.002, d.height / 2, -d.width * 0.18]} color="#07080a" />
      <Perforated
        size={[d.width * 0.5, d.height * 0.8]}
        position={[-0.005, d.height / 2, -d.width * 0.18]}
        rotation={[0, -Math.PI / 2, 0]}
        color={spec.visual.color}
        pitch={0.045}
      />
      <Box size={[0.03, 0.18, 0.24]} position={[-0.015, d.height * 0.5, d.width * 0.27]} color={PLASTIC} />
      <Box size={[0.03, 0.1, 0.06]} position={[-0.015, d.height * 0.5, d.width * 0.42]} color="#1e1f24" />

      {/* front: modular panel or a fixed cable exit */}
      <Box size={[0.01, d.height * 0.7, d.width * 0.8]} position={[d.depth + 0.005, d.height / 2, 0]} color="#0a0b0e" />
      {Array.from({ length: sockets }, (_, i) => {
        const cols = 4;
        const row = Math.floor(i / cols);
        const col = i % cols;
        return (
          <Box
            key={i}
            size={[0.012, 0.14, d.width * 0.15]}
            position={[d.depth + 0.011, d.height * (sockets > cols ? 0.66 - row * 0.32 : 0.5), -d.width * 0.3 + col * d.width * 0.2]}
            color="#1c1e24"
          />
        );
      })}
      {spec.modular !== "full" &&
        [-0.08, 0, 0.08].map((dz) => (
          <Cyl
            key={dz}
            r={0.04}
            h={0.1}
            position={[d.depth + 0.05, d.height * (spec.modular === "semi" ? 0.2 : 0.5), dz + (spec.modular === "semi" ? d.width * 0.3 : 0)]}
            axis="x"
            color={PLASTIC}
            roughness={0.8}
          />
        ))}
    </group>
  );
}
