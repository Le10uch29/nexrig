"use client";

/**
 * Procedural hardware models. Dimensions come from the component specs and the shared layout
 * (features/installation/layout.ts); appearance is schematic. Replace any model with a GLB by
 * keeping the same local origin convention documented on each component.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { BOARD_LAYOUTS, BOARD_THICKNESS, caseGeometry, DIMM_LENGTH, MM, PCIE_SLOT_RANGE, PSU_DIMENSIONS, SLOT_PITCH, type Vec3 } from "@/features/installation/layout";
import type { CaseSpec, CoolerSpec, CpuSpec, FanSpec, GpuSpec, MotherboardSpec, PsuSpec, RamSpec, StorageSpec } from "@/types/hardware";
import type { CaseMode } from "@/features/build-state/store";

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

const GOLD = "#c9a24a";
const STEEL = "#9ea3ac";
const DARK = "#14161b";

/* ------------------------------------------------------------------ fans */

/** 120 mm fan facing +z, centred on the origin. */
export function FanUnit({ size = 1.2, depth = 0.25, frame = DARK, accent = "#3a3d45", rgb = false, spin = true }: { size?: number; depth?: number; frame?: string; accent?: string; rgb?: boolean; spin?: boolean }) {
  const blades = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spin && blades.current) blades.current.rotation.z -= dt * 9;
  });
  const r = size * 0.46;
  const bar = size * 0.12;
  return (
    <group>
      {/* frame corners */}
      <Box size={[size, bar, depth]} position={[0, size / 2 - bar / 2, 0]} color={frame} />
      <Box size={[size, bar, depth]} position={[0, -size / 2 + bar / 2, 0]} color={frame} />
      <Box size={[bar, size, depth]} position={[size / 2 - bar / 2, 0, 0]} color={frame} />
      <Box size={[bar, size, depth]} position={[-size / 2 + bar / 2, 0, 0]} color={frame} />
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r + 0.02, r + 0.02, depth * 0.9, 32, 1, true]} />
        <meshStandardMaterial color={frame} side={THREE.DoubleSide} roughness={0.7} />
      </mesh>
      {rgb && (
        <mesh position={[0, 0, depth / 2]}>
          <torusGeometry args={[r, 0.018, 8, 48]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.6} />
        </mesh>
      )}
      <group ref={blades}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} rotation={[0.35, 0, (i / 7) * Math.PI * 2]} position={[0, 0, 0]}>
            <boxGeometry args={[0.07, r * 1.85, 0.012]} />
            <meshStandardMaterial color="#2b2f38" roughness={0.5} />
          </mesh>
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

export function CaseModel({ spec, mode }: { spec: CaseSpec; mode: CaseMode }) {
  const g = caseGeometry(spec);
  const { width: W, height: H, depth: D, wall } = g;
  const body = spec.visual.color;
  const accent = spec.visual.accent ?? "#2b2f36";
  const light = spec.visual.color.toLowerCase() > "#888888";
  const interior = light ? "#c9ccd4" : "#0d0f14";
  const sideOpacity = mode === "solid" ? 1 : 0.1;
  const shroudLen = D - 0.5;
  return (
    <group>
      {/* shell */}
      <Box size={[D, wall, W]} position={[0, wall / 2, 0]} color={body} />
      <Box size={[D, wall, W]} position={[0, H - wall / 2, 0]} color={body} roughness={0.8} />
      <Box size={[wall, H, W]} position={[-D / 2 + wall / 2, H / 2, 0]} color={body} />
      <Box size={[wall, H, W]} position={[D / 2 - wall / 2, H / 2, 0]} color={body} roughness={0.9} />
      <Box size={[D, H, wall]} position={[0, H / 2, -W / 2 + wall / 2]} color={body} />
      {/* motherboard tray */}
      <Box size={[D - 0.2, H - 0.2, 0.01]} position={[0, H / 2, g.trayZ - 0.03]} color={interior} roughness={0.85} />
      {/* rear expansion slot covers */}
      {Array.from({ length: spec.style === "compact" ? 3 : 7 }, (_, i) => (
        <Box key={i} size={[0.012, 0.16, 1.1]} position={[-D / 2 + wall + 0.01, g.boardOrigin[1] - 1.55 - i * SLOT_PITCH + 0.1, g.trayZ + 0.62]} color={light ? "#b9bcc4" : "#20232a"} />
      ))}
      {/* front styling */}
      {spec.style === "mesh" &&
        Array.from({ length: 9 }, (_, i) => (
          <Box key={i} size={[0.03, H - 0.3, 0.06]} position={[D / 2 + 0.015, H / 2, -W / 2 + 0.25 + i * ((W - 0.5) / 8)]} color={accent} roughness={0.7} />
        ))}
      {spec.style === "glass-showcase" && (
        <Box size={[0.02, H - 0.1, W - 0.1]} position={[D / 2 + 0.01, H / 2, 0]} color="#9fb4ff" opacity={mode === "solid" ? 0.5 : 0.08} metalness={0.1} roughness={0.05} />
      )}
      {/* PSU shroud */}
      <Box size={[shroudLen, wall, W - wall * 2]} position={[-D / 2 + shroudLen / 2, g.shroudHeight, 0]} color={body} />
      <Box size={[shroudLen, g.shroudHeight, wall]} position={[-D / 2 + shroudLen / 2, g.shroudHeight / 2, W / 2 - wall * 1.5]} color={body} />
      {/* glass / side panel */}
      {mode !== "open" && (
        <Box size={[D, H, 0.02]} position={[0, H / 2, W / 2 - 0.01]} color={mode === "solid" ? body : "#a8b8ff"} opacity={sideOpacity} metalness={0.1} roughness={mode === "solid" ? 0.7 : 0.05} />
      )}
      {/* feet */}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} size={[0.4, 0.08, 0.3]} position={[sx * (D / 2 - 0.4), -0.04, sz * (W / 2 - 0.3)]} color={DARK} />))}
      {/* subtle interior accent light strip */}
      <Box size={[0.02, H - 0.6, 0.02]} position={[D / 2 - 0.12, H / 2 + 0.2, -W / 2 + 0.12]} color={accent} emissive="#8d7dff" emissiveIntensity={0.6} />
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
  return (
    <group>
      <Box size={[L.width, L.height, BOARD_THICKNESS]} position={[L.width / 2, -L.height / 2, -BOARD_THICKNESS / 2]} color={spec.visual.color} roughness={0.8} />
      {/* socket */}
      <Box size={intel ? [0.5, 0.6, 0.03] : [0.6, 0.6, 0.03]} position={[cx, cy, 0.015]} color="#2a2d33" metalness={0.4} />
      <Box size={intel ? [0.56, 0.66, 0.012] : [0.66, 0.66, 0.012]} position={[cx, cy, 0.006]} color={STEEL} metalness={0.7} roughness={0.35} />
      {/* VRM heatsinks */}
      <Box size={[1.0, 0.28, 0.22]} position={[cx, cy + 0.6, 0.11]} color={accent} metalness={0.55} roughness={0.4} />
      <Box size={[0.28, 1.05, 0.22]} position={[Math.max(0.2, cx - 0.6), cy - 0.05, 0.11]} color={accent} metalness={0.55} roughness={0.4} />
      {/* rear I/O shroud */}
      <Box size={[0.3, Math.min(1.25, L.height * 0.45), 0.32]} position={[0.15, -Math.min(1.25, L.height * 0.45) / 2 - 0.1, 0.16]} color="#1b1d22" metalness={0.3} />
      {/* DIMM slots */}
      {L.dimms.slice(0, spec.memorySlots).map(([x, y], i) => (
        <group key={i}>
          <Box size={[0.06, DIMM_LENGTH + 0.05, 0.08]} position={[x, y, 0.04]} color="#15171c" />
          <Box size={[0.07, 0.06, 0.1]} position={[x, y + DIMM_LENGTH / 2 + 0.05, 0.05]} color="#2c2f37" />
        </group>
      ))}
      {/* PCIe slots */}
      <Box size={[PCIE_SLOT_RANGE[1] - PCIE_SLOT_RANGE[0], 0.075, 0.1]} position={[(PCIE_SLOT_RANGE[0] + PCIE_SLOT_RANGE[1]) / 2, L.pcie[1], 0.05]} color="#1a1c21" />
      <Box size={[PCIE_SLOT_RANGE[1] - PCIE_SLOT_RANGE[0] + 0.02, 0.09, 0.03]} position={[(PCIE_SLOT_RANGE[0] + PCIE_SLOT_RANGE[1]) / 2, L.pcie[1], 0.1]} color={STEEL} metalness={0.8} roughness={0.3} />
      {spec.formFactor !== "ITX" &&
        [3, 5].map((n) => (
          <Box key={n} size={[0.89, 0.06, 0.08]} position={[0.865, L.pcie[1] - n * SLOT_PITCH, 0.04]} color="#1a1c21" />
        ))}
      {/* M.2 slot connectors and heatsink pads */}
      {L.m2.slice(0, spec.m2Slots).map(([x, y], i) => (
        <group key={i}>
          <Box size={[0.06, 0.24, 0.05]} position={[x - 0.02, y, 0.025]} color="#24262c" />
          <Box size={[0.04, 0.04, 0.03]} position={[x + 0.8, y, 0.015]} color={GOLD} metalness={0.8} />
        </group>
      ))}
      {/* chipset heatsink */}
      <Box size={[0.55, 0.5, 0.1]} position={[L.chipset[0], L.chipset[1], 0.05]} color={accent} metalness={0.5} roughness={0.35} />
      {/* 24-pin ATX power */}
      <Box size={[0.14, 0.55, 0.18]} position={[L.width - 0.1, -1.0, 0.09]} color="#121317" />
      {/* 8-pin EPS */}
      <Box size={[0.3, 0.12, 0.16]} position={[0.75, -0.1, 0.08]} color="#121317" />
    </group>
  );
}

/* ------------------------------------------------------------------ cpu */

/** Origin: socket centre on the board surface. */
export function CpuModel({ spec }: { spec: CpuSpec }) {
  const intel = spec.socket.startsWith("LGA");
  const [w, h] = intel ? [0.375, 0.45] : [0.4, 0.4];
  return (
    <group>
      <Box size={[w, h, 0.03]} position={[0, 0, 0.03]} color={spec.socket === "AM4" ? "#1d5a3a" : "#1d4d3a"} roughness={0.7} />
      <Box size={[w * 0.86, h * 0.8, 0.03]} position={[0, 0, 0.06]} color={spec.visual.color} metalness={0.85} roughness={0.28} />
    </group>
  );
}

/* ------------------------------------------------------------------ cooler */

function FinStack({ size, position, color }: { size: Vec3; position: Vec3; color: string }) {
  const count = Math.max(8, Math.round(size[2] / 0.045));
  const ref = useRef<THREE.InstancedMesh>(null);
  const matrices = useMemo(() => {
    const m = new THREE.Matrix4();
    return Array.from({ length: count }, (_, i) => m.clone().makeTranslation(0, 0, -size[2] / 2 + (i + 0.5) * (size[2] / count)));
  }, [count, size]);
  return (
    <group position={position}>
      <instancedMesh
        ref={(mesh) => {
          ref.current = mesh;
          if (mesh) {
            matrices.forEach((mat, i) => mesh.setMatrixAt(i, mat));
            mesh.instanceMatrix.needsUpdate = true;
          }
        }}
        args={[undefined, undefined, count]}
      >
        <boxGeometry args={[size[0], size[1], 0.012]} />
        <meshStandardMaterial color={color} metalness={0.75} roughness={0.32} />
      </instancedMesh>
    </group>
  );
}

/** Origin: top of the CPU heat spreader. Radiator offset is relative to this origin (AIO only). */
export function CoolerModel({ spec, radiatorOffset, spin }: { spec: CoolerSpec; radiatorOffset?: Vec3; spin: boolean }) {
  const H = spec.heightMm * MM;
  const accent = spec.visual.accent ?? DARK;
  if (spec.kind === "aio") {
    return (
      <group>
        <mesh position={[0, 0, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.32, 0.34, 0.45, 40]} />
          <meshStandardMaterial color={spec.visual.color} roughness={0.45} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0.47]}>
          <torusGeometry args={[0.26, 0.015, 8, 48]} />
          <meshStandardMaterial color="#8d7dff" emissive="#8d7dff" emissiveIntensity={1.4} />
        </mesh>
        {radiatorOffset && <AioRadiator offset={radiatorOffset} spec={spec} spin={spin} />}
      </group>
    );
  }
  if (H < 0.6) {
    return (
      <group>
        <Box size={[0.45, 0.45, 0.06]} position={[0, 0, 0.03]} color="#b87333" metalness={0.8} roughness={0.3} />
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
  return (
    <group>
      <Box size={[0.4, 0.4, 0.07]} position={[0, 0, 0.035]} color="#c0c4cc" metalness={0.85} roughness={0.25} />
      {[-0.15, -0.05, 0.05, 0.15].map((x) => (
        <mesh key={x} position={[x * (dual ? 2.4 : 1), 0, (H - 0.1) / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, H - 0.1, 12]} />
          <meshStandardMaterial color="#b87333" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
      {stacks.map((x) => (
        <FinStack key={x} size={[stackW, 1.25, H - 0.38]} position={[x, 0, finZ]} color={spec.visual.color} />
      ))}
      {stacks.map((x) => (
        <Box key={`cap${x}`} size={[stackW + 0.02, 1.27, 0.05]} position={[x, 0, H - 0.05]} color={accent} metalness={0.4} />
      ))}
      <group position={[dual ? 0 : stackW / 2 + 0.14, 0, finZ]} rotation={[0, Math.PI / 2, 0]}>
        <FanUnit frame={accent} accent={spec.visual.color} spin={spin} />
      </group>
    </group>
  );
}

function AioRadiator({ offset, spec, spin }: { offset: Vec3; spec: CoolerSpec; spin: boolean }) {
  const len = (spec.radiatorMm ?? 360) * MM + 0.37;
  const fans = Math.round((spec.radiatorMm ?? 360) / 120);
  const tubes = useMemo(() => {
    const mk = (dy: number) =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.2, dy, 0.32),
        new THREE.Vector3(0.9, dy * 3, 0.9),
        new THREE.Vector3(offset[0] - 0.6, offset[1] + len / 2 - 0.2 + dy, 0.6),
        new THREE.Vector3(offset[0] - 0.15, offset[1] + len / 2 - 0.2 + dy, offset[2] + 0.3),
      ]);
    return [mk(0.08), mk(-0.08)];
  }, [offset, len]);
  return (
    <group>
      <group position={offset}>
        <Box size={[0.27, len, 1.22]} color={spec.visual.color} roughness={0.6} />
        {Array.from({ length: fans }, (_, i) => (
          <group key={i} position={[-0.27, len / 2 - 0.2 - 0.6 - i * 1.2, 0]} rotation={[0, Math.PI / 2, 0]}>
            <FanUnit frame={spec.visual.accent ?? DARK} spin={spin} />
          </group>
        ))}
      </group>
      {tubes.map((curve, i) => (
        <mesh key={i}>
          <tubeGeometry args={[curve, 40, 0.035, 8, false]} />
          <meshStandardMaterial color="#121317" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ memory */

/** Origin: centre of the first used DIMM slot on the board surface. */
export function RamModel({ spec, items }: { spec: RamSpec; items: { offset: Vec3 }[] }) {
  const h = spec.heightMm * MM;
  const accent = spec.visual.accent ?? DARK;
  const glow = accent === "#8b8fff" || accent === "#8d7dff";
  return (
    <group>
      {items.map((it, i) => (
        <group key={i} position={it.offset}>
          <Box size={[0.025, DIMM_LENGTH, h - 0.02]} position={[0, 0, (h - 0.02) / 2 + 0.02]} color="#1d4d3a" />
          <Box size={[0.075, DIMM_LENGTH - 0.03, h - 0.06]} position={[0, 0, (h - 0.06) / 2 + 0.05]} color={spec.visual.color} metalness={0.55} roughness={0.38} />
          <Box size={[0.08, DIMM_LENGTH - 0.05, 0.045]} position={[0, 0, h - 0.01]} color={accent} emissive={glow ? accent : undefined} emissiveIntensity={glow ? 1.5 : 0} />
          <Box size={[0.03, DIMM_LENGTH - 0.1, 0.02]} position={[0, 0, 0.01]} color={GOLD} metalness={0.9} roughness={0.3} />
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

/**
 * Origin: PCIe slot line at the board's rear edge, on the board surface.
 * +x along the card toward the case front, -y is the cooler side, +z away from the board.
 */
export function GpuModel({ spec, spin }: { spec: GpuSpec; spin: boolean }) {
  const { L, T, Hc } = gpuDims(spec);
  const accent = spec.visual.accent ?? STEEL;
  const fans = L > 2.6 ? 3 : 2;
  const fanR = Math.min(0.48, (L - 0.3) / fans / 2 - 0.04);
  const blades = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spin && blades.current) blades.current.children.forEach((c) => (c.rotation.y += dt * 8));
  });
  return (
    // Card body starts at the slot's top edge; only the edge connector reaches into the slot.
    <group position={[0, 0, GPU_SEAT_Z]}>
      {/* PCB + backplate */}
      <Box size={[L - 0.05, 0.02, Hc - 0.05]} position={[L / 2, 0.01, Hc / 2]} color="#16301f" />
      <Box size={[L - 0.05, 0.02, Hc - 0.05]} position={[L / 2, 0.035, Hc / 2]} color="#1c1e23" metalness={0.6} roughness={0.4} />
      {/* shroud */}
      <Box size={[L, T - 0.05, Hc]} position={[L / 2, -(T - 0.05) / 2, Hc / 2 + 0.005]} color={spec.visual.color} metalness={0.5} roughness={0.42} />
      {/* edge accent */}
      <Box size={[L * 0.92, 0.025, 0.02]} position={[L / 2, -T * 0.5, Hc + 0.01]} color={accent} emissive={accent} emissiveIntensity={0.35} />
      {/* fans on the cooler side */}
      <group ref={blades}>
        {Array.from({ length: fans }, (_, i) => {
          const x = 0.15 + ((L - 0.3) / fans) * (i + 0.5);
          return (
            <group key={i} position={[x, -T + 0.03, Hc / 2]}>
              {Array.from({ length: 9 }, (_, k) => (
                <mesh key={k} rotation={[0, (k / 9) * Math.PI * 2, 0.25]}>
                  <boxGeometry args={[0.05, 0.012, fanR * 1.85]} />
                  <meshStandardMaterial color="#20232a" />
                </mesh>
              ))}
            </group>
          );
        })}
      </group>
      {Array.from({ length: fans }, (_, i) => {
        const x = 0.15 + ((L - 0.3) / fans) * (i + 0.5);
        return (
          <group key={i} position={[x, -T + 0.02, Hc / 2]}>
            <mesh>
              <torusGeometry args={[fanR, 0.02, 8, 40]} />
              <meshStandardMaterial color={accent} metalness={0.6} roughness={0.35} />
            </mesh>
            <mesh>
              <cylinderGeometry args={[fanR * 0.28, fanR * 0.28, 0.03, 24]} />
              <meshStandardMaterial color={accent} metalness={0.4} />
            </mesh>
          </group>
        );
      })}
      {/* I/O bracket */}
      <Box size={[0.02, T + 0.06, 1.2]} position={[-0.01, -T / 2 + 0.03, 0.6]} color={STEEL} metalness={0.85} roughness={0.3} />
      {[0.25, 0.5, 0.75, 1.0].map((z) => (
        <Box key={z} size={[0.03, 0.08, 0.15]} position={[-0.012, -0.07, z]} color="#0a0b0e" />
      ))}
      {/* PCIe edge connector: sits inside the slot when installed */}
      <Box size={[PCIE_SLOT_RANGE[1] - PCIE_SLOT_RANGE[0], 0.012, 0.09]} position={[(PCIE_SLOT_RANGE[0] + PCIE_SLOT_RANGE[1]) / 2, 0.005, -0.045]} color={GOLD} metalness={0.9} roughness={0.25} />
      {/* power connector */}
      <Box size={[0.22, 0.1, 0.09]} position={[L * 0.55, -0.04, Hc + 0.045]} color="#0c0d10" />
    </group>
  );
}

/* ------------------------------------------------------------------ storage */

/** NVMe: origin at the connector end, stick extends +x. SATA: origin at a bottom corner. */
export function StorageModel({ spec }: { spec: StorageSpec }) {
  if (spec.formFactor === "3.5in") {
    // 3.5″ HDD: 147 × 26 × 102 mm, lying flat; origin at a bottom corner.
    return (
      <group>
        <Box size={[1.47, 0.26, 1.02]} position={[0.735, 0.13, 0.51]} color={spec.visual.color} metalness={0.75} roughness={0.35} />
        <Box size={[1.1, 0.005, 0.8]} position={[0.735, 0.262, 0.51]} color="#d9dce2" metalness={0.2} roughness={0.6} />
        <Box size={[0.02, 0.12, 0.6]} position={[1.475, 0.1, 0.51]} color="#1a1b1f" />
      </group>
    );
  }
  if (spec.interface === "SATA") {
    return (
      <group>
        <Box size={[1.0, 0.07, 0.7]} position={[0.5, 0.035, 0.35]} color={spec.visual.color} metalness={0.5} roughness={0.4} />
        <Box size={[0.5, 0.005, 0.35]} position={[0.5, 0.073, 0.35]} color={spec.visual.accent ?? STEEL} />
      </group>
    );
  }
  return (
    <group>
      <Box size={[0.8, 0.22, 0.016]} position={[0.4, 0, 0.008]} color="#141518" />
      <Box size={[0.22, 0.17, 0.02]} position={[0.2, 0, 0.026]} color="#26282e" />
      <Box size={[0.32, 0.17, 0.02]} position={[0.52, 0, 0.026]} color="#26282e" />
      <Box size={[0.5, 0.18, 0.003]} position={[0.45, 0, 0.038]} color={spec.visual.accent ?? STEEL} />
      <Box size={[0.04, 0.2, 0.012]} position={[0.01, 0, 0.008]} color={GOLD} metalness={0.9} />
    </group>
  );
}

/* ------------------------------------------------------------------ psu */

export function psuDims(spec: PsuSpec) {
  return PSU_DIMENSIONS[spec.formFactor];
}

/** Origin: rear-bottom edge centre. Extends +x (depth), +y (height), ±z (width). */
export function PsuModel({ spec }: { spec: PsuSpec }) {
  const d = psuDims(spec);
  return (
    <group>
      <Box size={[d.depth, d.height, d.width]} position={[d.depth / 2, d.height / 2, 0]} color={spec.visual.color} metalness={0.45} roughness={0.5} />
      <Box size={[d.depth * 0.6, d.height * 0.45, 0.005]} position={[d.depth / 2, d.height / 2, d.width / 2 + 0.003]} color={spec.visual.accent ?? "#2a2c31"} />
      <Box size={[0.01, d.height * 0.7, d.width * 0.8]} position={[d.depth + 0.005, d.height / 2, 0]} color="#0a0b0e" />
      <mesh position={[d.depth / 2, -0.003, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[d.width * 0.18, d.width * 0.4, 40]} />
        <meshStandardMaterial color="#202227" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
