import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: { default: "NexRig — конфигуратор ПК", template: "%s · NexRig" },
  description: "Интерактивная 3D-сборка ПК, проверка совместимости, оценка FPS и рекомендации по апгрейду.",
};

export const viewport: Viewport = {
  themeColor: "#06080d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${manrope.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
