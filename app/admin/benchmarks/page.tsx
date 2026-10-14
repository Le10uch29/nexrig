import type { Metadata } from "next";
import { BenchmarkAdmin } from "@/components/admin/BenchmarkAdmin";

export const metadata: Metadata = { title: "Бенчмарки · администрирование", robots: { index: false, follow: false } };

/** Admin console; every action is authorised server-side (lib/server/admin-auth.ts). */
export default function BenchmarkAdminPage() {
  return <BenchmarkAdmin />;
}
