import type { Metadata } from "next";
import { UpgradeView } from "@/components/ai/UpgradeView";

export const metadata: Metadata = { title: "Советник по апгрейду" };

export default function UpgradePage() {
  return <UpgradeView />;
}
