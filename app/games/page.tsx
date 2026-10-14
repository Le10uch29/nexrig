import type { Metadata } from "next";
import { FpsLab } from "@/components/benchmarks/FpsLab";

export const metadata: Metadata = { title: "FPS Lab" };

export default function GamesPage() {
  return <FpsLab />;
}
