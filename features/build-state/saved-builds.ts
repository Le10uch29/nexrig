"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { resolveBuild, totalPrice } from "@/lib/hardware/repository";
import { savedBuildSchema } from "@/lib/validation/schemas";
import type { BuildSelection, SavedBuild } from "@/types/build";

/**
 * Saved builds persisted in this browser's localStorage. This is the only persistence available
 * without database credentials; supabase/migrations describes the server-side schema for later.
 */
interface SavedBuildsState {
  builds: SavedBuild[];
  save: (name: string, selection: BuildSelection) => SavedBuild;
  update: (id: string, selection: BuildSelection, name?: string) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  importJson: (json: string) => { ok: true; build: SavedBuild } | { ok: false; error: string };
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `b-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const useSavedBuilds = create<SavedBuildsState>()(
  persist(
    (set, get) => ({
      builds: [],
      save: (name, selection) => {
        const now = new Date().toISOString();
        const build: SavedBuild = {
          id: newId(),
          name: name.trim() || "Без названия",
          createdAt: now,
          updatedAt: now,
          selection,
          totalPriceRub: totalPrice(resolveBuild(selection)),
        };
        set({ builds: [build, ...get().builds] });
        return build;
      },
      update: (id, selection, name) =>
        set({
          builds: get().builds.map((b) =>
            b.id === id
              ? { ...b, selection, name: name ?? b.name, updatedAt: new Date().toISOString(), totalPriceRub: totalPrice(resolveBuild(selection)) }
              : b,
          ),
        }),
      remove: (id) => set({ builds: get().builds.filter((b) => b.id !== id) }),
      duplicate: (id) => {
        const src = get().builds.find((b) => b.id === id);
        if (src) get().save(`${src.name} (копия)`, src.selection);
      },
      importJson: (json) => {
        try {
          const parsed = savedBuildSchema.safeParse(JSON.parse(json));
          if (!parsed.success) return { ok: false, error: "Файл не похож на сборку NexRig." };
          return { ok: true, build: get().save(parsed.data.name, parsed.data.selection) };
        } catch {
          return { ok: false, error: "Некорректный JSON." };
        }
      },
    }),
    { name: "buildai.saved-builds.v1", storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);
