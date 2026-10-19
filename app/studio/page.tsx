import type { Metadata } from "next";
import { StudioConfigurator } from "@/components/studio/StudioConfigurator";
import { loadVideocart } from "@/lib/videocart/load";

export const metadata: Metadata = { title: "Шоурум · демо конфигуратора" };

/** Design demo: showroom configurator. The graphics-card table is read at build time. */
export default function StudioPage() {
  const { rows, error } = loadVideocart();
  return <StudioConfigurator rows={rows} error={error} />;
}
