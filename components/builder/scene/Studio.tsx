"use client";

import { MeshReflectorMaterial, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import * as THREE from "three";

/** Showroom palette: graphite hall, neutral cool light, NexRig violet as the only accent. */
export const STUDIO_VIOLET = "#8d7dff";
export const STUDIO_VIOLET_DEEP = "#5b4bd6";
const LIGHT = "#dfe4f2";

/** Photo backdrop of the showroom (public/studio). */
export const STUDIO_BACKDROP_URL = "/studio/hall-backdrop.webp";

/**
 * Photo as the scene background, scaled like CSS `cover` to the canvas. It is drawn behind
 * everything and does not move with the camera; the 3D scene in front of it is unchanged.
 */
/**
 * Crops the texture like CSS `cover` for a canvas of the given size, zoomed in by `zoom` and
 * aligned to the bottom edge — so the photo's floor ring sits under the podium.
 */
function fitCover(tex: THREE.Texture, width: number, height: number, zoom = 1.25) {
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = tex.image as { width: number; height: number } | undefined;
  if (!img || !width || !height) return;
  const imageAspect = img.width / img.height;
  const canvasAspect = width / height;
  const rx = (canvasAspect > imageAspect ? 1 : canvasAspect / imageAspect) / zoom;
  const ry = (canvasAspect > imageAspect ? imageAspect / canvasAspect : 1) / zoom;
  tex.repeat.set(rx, ry);
  tex.offset.set((1 - rx) / 2, 0);
}

function Backdrop({ url }: { url: string }) {
  const tex = useTexture(url);
  const size = useThree((s) => s.size);
  useEffect(() => fitCover(tex, size.width, size.height), [tex, size.width, size.height]);
  // Attached as scene.background; detaching on unmount restores the previous background.
  return <primitive attach="background" object={tex} />;
}

/** Top of the podium: the build stands here. */
export const PODIUM_TOP = 0.125;

/** Studio lighting (neutral key and fill, violet rims). Each rendered scene needs its own copy. */
export function StudioLights({ bright = false }: { bright?: boolean }) {
  return (
    <>
      <hemisphereLight args={["#e6e9f5", "#0c0d12", bright ? 1.15 : 0.8]} />
      <pointLight position={[0, 9, -13]} intensity={bright ? 95 : 70} distance={26} color={LIGHT} />
      <spotLight position={[0, 14, 6]} angle={0.42} penumbra={0.8} intensity={bright ? 215 : 180} distance={40} color="#f2f4fb" />
      <directionalLight position={[6, 8, 10]} intensity={bright ? 2.0 : 1.6} color="#ffffff" />
      <pointLight position={[-6, 3, -3]} intensity={55} distance={18} color={STUDIO_VIOLET} />
      <pointLight position={[7, 2.5, -4]} intensity={35} distance={16} color={STUDIO_VIOLET_DEEP} />
    </>
  );
}

/** The lit turntable podium (circular, so it looks the same from every angle). */
export function StudioStage({ radius, animate }: { radius: number; animate: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animate || !ring.current) return;
    const m = ring.current.material as THREE.MeshBasicMaterial;
    m.opacity = 0.78 + Math.sin(clock.elapsedTime * 1.4) * 0.16;
  });
  return (
    <>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[radius, radius * 1.03, 0.12, 96]} />
        <meshStandardMaterial color="#111219" metalness={0.75} roughness={0.32} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, PODIUM_TOP, 0]}>
        <ringGeometry args={[radius * 0.965, radius, 128]} />
        <meshBasicMaterial color={STUDIO_VIOLET} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[radius * 1.06, radius * 1.09, 128]} />
        <meshBasicMaterial color={STUDIO_VIOLET_DEEP} transparent opacity={0.3} toneMapped={false} />
      </mesh>
    </>
  );
}

/**
 * Showroom environment for the import viewer: podium, set and lights in one scene.
 * The builder renders the set and the stage as separate layers (see StaticLayer in PcScene).
 */
export function Studio({ radius, animate, backdrop }: { radius: number; animate: boolean; backdrop?: string }) {
  return (
    <>
      <StudioSet backdrop={backdrop} />
      <StudioStage radius={radius} animate={animate} />
    </>
  );
}

/**
 * Everything around the podium: a graphite hall with a reflective floor — or, with `backdrop`, a
 * photo of a hall (the modelled walls and floor are then hidden so the photo shows) — plus lights.
 * Rendered as a fragment so the backdrop attaches to the scene (scene.background).
 */
export function StudioSet({ bright = false, backdrop }: { bright?: boolean; backdrop?: string }) {
  const hall = !backdrop;
  return (
    <>
      {backdrop && (
        <Suspense fallback={null}>
          <Backdrop url={backdrop} />
        </Suspense>
      )}

      {hall && (
        /* reflective floor */
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
          <planeGeometry args={[90, 90]} />
          <MeshReflectorMaterial
            resolution={512}
            blur={[320, 90]}
            mixBlur={1}
            mixStrength={10}
            depthScale={0.9}
            minDepthThreshold={0.6}
            maxDepthThreshold={1.3}
            roughness={0.85}
            metalness={0.5}
            color="#0d0e14"
            mirror={0.4}
          />
        </mesh>
      )}

      {hall && (
        <>
          {/* hall: light columns along the back */}
          {[-14, -8.5, 8.5, 14].map((x) => (
            <group key={x} position={[x, 0, -13]}>
              <mesh position={[0, 7, 0]}>
                <boxGeometry args={[1.4, 14, 1.4]} />
                <meshStandardMaterial color="#13141b" metalness={0.6} roughness={0.5} />
              </mesh>
              <mesh position={[x < 0 ? 0.71 : -0.71, 6, 0.3]}>
                <boxGeometry args={[0.04, 9, 0.12]} />
                <meshBasicMaterial color={Math.abs(x) > 10 ? STUDIO_VIOLET : LIGHT} toneMapped={false} />
              </mesh>
            </group>
          ))}
          {/* back wall with a glowing seam and light bars */}
          <mesh position={[0, 7, -16]}>
            <planeGeometry args={[60, 14]} />
            <meshStandardMaterial color="#15161e" emissive="#12121b" emissiveIntensity={0.6} roughness={0.9} />
          </mesh>
          <mesh position={[0, 4.2, -15.9]}>
            <planeGeometry args={[18, 0.05]} />
            <meshBasicMaterial color={STUDIO_VIOLET} transparent opacity={0.55} toneMapped={false} />
          </mesh>
          {[-5, -2.5, 2.5, 5].map((x) => (
            <mesh key={x} position={[x, 8, -15.85]}>
              <planeGeometry args={[0.12, 6]} />
              <meshBasicMaterial color={LIGHT} transparent opacity={0.6} toneMapped={false} />
            </mesh>
          ))}
          {/* ceiling light panels, angled toward the podium */}
          {[-6, 0, 6].map((x) => (
            <mesh key={x} position={[x, 13, -4]} rotation={[Math.PI / 2.4, 0, 0]}>
              <planeGeometry args={[3.6, 0.5]} />
              <meshBasicMaterial color="#eef1fa" toneMapped={false} />
            </mesh>
          ))}
        </>
      )}

      <StudioLights bright={bright} />
    </>
  );
}
