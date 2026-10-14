"use client";

import { useEffect, type ReactNode } from "react";
import { useMeasuredBenchmarks } from "@/features/benchmarks/measured-store";
import { useSavedBuilds } from "@/features/build-state/saved-builds";
import { useBuildStore } from "@/features/build-state/store";
import { useCurrencyStore } from "@/features/settings/currency";
import { AuthModal } from "@/components/auth/AuthModal";
import { TopNav } from "./TopNav";

/** Persisted stores skip SSR hydration; restore them once on the client to avoid markup mismatch. */
function StoreHydrator() {
  useEffect(() => {
    void useBuildStore.persist.rehydrate();
    void useSavedBuilds.persist.rehydrate();
    void useMeasuredBenchmarks.persist.rehydrate();
    void useCurrencyStore.persist.rehydrate();
  }, []);
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <StoreHydrator />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2">
        К содержимому
      </a>
      <TopNav />
      <main id="main" className="flex min-h-0 flex-1 flex-col">
        {children}
      </main>
      <AuthModal />
    </div>
  );
}
