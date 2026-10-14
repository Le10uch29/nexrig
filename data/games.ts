import type { Game } from "@/types/benchmark";

/**
 * Game list with ESTIMATION MODEL PARAMETERS.
 * `model` values are hand-set calibration constants for the relative-performance model in
 * lib/benchmark-engine. They are not benchmark results and must be recalibrated against real
 * measurements before they are relied upon.
 * Upscaler / frame-generation support follows public patch notes and can change with updates.
 */
export const GAMES: Game[] = [
  {
    id: "cyberpunk-2077",
    title: "Cyberpunk 2077",
    version: "2.x",
    genre: "RPG / открытый мир",
    supportsRayTracing: true,
    upscalers: ["DLSS", "FSR", "XeSS"],
    frameGen: ["DLSS-FG", "FSR-FG"],
    model: { gpuFps1440High: 78, cpuFpsCap: 150, rtCost: 0.5, lowRatio: 0.76 },
  },
  {
    id: "cs2",
    title: "Counter-Strike 2",
    version: "2025+",
    genre: "Соревновательный шутер",
    supportsRayTracing: false,
    upscalers: ["FSR"],
    frameGen: [],
    model: { gpuFps1440High: 330, cpuFpsCap: 460, rtCost: 1, lowRatio: 0.55 },
  },
  {
    id: "baldurs-gate-3",
    title: "Baldur's Gate 3",
    version: "Patch 7+",
    genre: "RPG",
    supportsRayTracing: false,
    upscalers: ["DLSS", "FSR"],
    frameGen: [],
    model: { gpuFps1440High: 112, cpuFpsCap: 135, rtCost: 1, lowRatio: 0.68 },
  },
  {
    id: "alan-wake-2",
    title: "Alan Wake 2",
    version: "1.2+",
    genre: "Хоррор / экшен",
    supportsRayTracing: true,
    upscalers: ["DLSS", "FSR"],
    frameGen: ["DLSS-FG"],
    model: { gpuFps1440High: 56, cpuFpsCap: 140, rtCost: 0.45, lowRatio: 0.8 },
  },
  {
    id: "fortnite",
    title: "Fortnite",
    version: "UE5, текущий сезон",
    genre: "Королевская битва",
    supportsRayTracing: true,
    upscalers: ["DLSS", "FSR"],
    frameGen: [],
    model: { gpuFps1440High: 150, cpuFpsCap: 260, rtCost: 0.55, lowRatio: 0.62 },
  },
  {
    id: "black-myth-wukong",
    title: "Black Myth: Wukong",
    version: "1.0+",
    genre: "Экшен-RPG",
    supportsRayTracing: true,
    upscalers: ["DLSS", "FSR", "XeSS"],
    frameGen: ["DLSS-FG", "FSR-FG"],
    model: { gpuFps1440High: 66, cpuFpsCap: 150, rtCost: 0.45, lowRatio: 0.78 },
  },
  {
    id: "forza-horizon-5",
    title: "Forza Horizon 5",
    version: "2024+",
    genre: "Гонки",
    supportsRayTracing: true,
    upscalers: ["DLSS", "FSR"],
    frameGen: ["DLSS-FG"],
    model: { gpuFps1440High: 138, cpuFpsCap: 210, rtCost: 0.85, lowRatio: 0.8 },
  },
];
