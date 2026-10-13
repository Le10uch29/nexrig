import type { Metadata } from "next";
import { ExpertView } from "@/components/ai/ExpertView";

export const metadata: Metadata = { title: "AI-эксперт" };

export default function ExpertPage() {
  return <ExpertView />;
}
