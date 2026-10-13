import type { BuildSelection } from "@/types/build";

/** Starting configuration: everything except the graphics card, so the first install is visible. */
export const DEFAULT_SELECTION: BuildSelection = {
  case: "fractal-design-north",
  motherboard: "asus-tuf-gaming-b650-plus-wifi",
  cpu: "amd-ryzen-7-7800x3d",
  cooler: "thermalright-peerless-assassin-120-se",
  ram: "kingston-fury-beast-ddr5-16gb-6000-cl36",
  ramCount: 2,
  gpu: null,
  storage: ["samsung-990-pro-2000gb"],
  psu: "corsair-rm750e-atx-3-0",
  fans: "arctic-p12-pwm-pst-x3",
};

export const DEFAULT_BUILD_NAME = "Игровая сборка AM5";
