import type { Metadata } from "next";
import { BuilderWorkspace } from "@/components/builder/BuilderWorkspace";

export const metadata: Metadata = { title: "Сборка ПК" };

export default function BuilderPage() {
  return <BuilderWorkspace />;
}
