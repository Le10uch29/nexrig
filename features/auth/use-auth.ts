"use client";

import type { User } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * Client-side auth state for the UI (who is signed in, whether to show admin links).
 * It is a display hint only: every protected API re-checks the session on the server.
 */
export interface AuthSnapshot {
  status: "loading" | "signed-out" | "signed-in" | "unavailable";
  user: { id: string; email: string | null; isAdmin: boolean } | null;
}

const SERVER: AuthSnapshot = { status: "loading", user: null };
let snapshot: AuthSnapshot = SERVER;
const listeners = new Set<() => void>();
let started = false;

function toSnapshot(user: User | null | undefined): AuthSnapshot {
  if (!user) return { status: "signed-out", user: null };
  return { status: "signed-in", user: { id: user.id, email: user.email ?? null, isAdmin: user.app_metadata?.role === "admin" } };
}

function emit(next: AuthSnapshot) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const supabase = getBrowserSupabase();
  if (!supabase) {
    emit({ status: "unavailable", user: null });
    return;
  }
  // getUser() asks the Auth server, so a revoked or expired session is not shown as signed in.
  supabase.auth.getUser().then(({ data }) => emit(toSnapshot(data.user)));
  supabase.auth.onAuthStateChange((_event, session) => emit(toSnapshot(session?.user)));
}

export function useAuth(): AuthSnapshot {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      start();
      return () => listeners.delete(cb);
    },
    () => snapshot,
    () => SERVER,
  );
}

/** Which auth dialog is open (shared by the header, admin page and any "sign in" prompt). */
export const useAuthDialog = create<{ open: "login" | "register" | null; show: (mode: "login" | "register") => void; close: () => void }>((set) => ({
  open: null,
  show: (mode) => set({ open: mode }),
  close: () => set({ open: null }),
}));
