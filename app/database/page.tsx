import type { Metadata } from "next";
import { DatabaseView } from "@/components/hardware/DatabaseView";

export const metadata: Metadata = { title: "Каталог" };

export default function DatabasePage() {
  return <DatabaseView />;
}
