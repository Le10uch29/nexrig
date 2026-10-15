import type { Metadata } from "next";
import { NexRigBenchmark } from "@/components/benchmark/NexRigBenchmark";

export const metadata: Metadata = { title: "NexRig Benchmark" };

export default function BenchmarkPage() {
  return <NexRigBenchmark />;
}
