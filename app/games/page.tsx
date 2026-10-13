import type { Metadata } from "next";
import { GamesView } from "@/components/benchmarks/GamesView";

export const metadata: Metadata = { title: "Игры и FPS" };

export default function GamesPage() {
  return <GamesView />;
}
