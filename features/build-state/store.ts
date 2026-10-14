"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_BUILD_NAME, DEFAULT_SELECTION } from "@/data/default-build";
import { hardwareRepository, normalizeRamCount } from "@/lib/hardware/repository";
import { getMessages } from "@/lib/i18n";
import type { GameSettings } from "@/types/benchmark";
import type { BuildSelection } from "@/types/build";
import { EMPTY_SELECTION } from "@/types/build";
import type { ComponentCategory, HardwareComponent } from "@/types/hardware";

export type InspectorView = "catalog" | "build" | "compat" | "perf" | "upgrade" | "saved" | "compare";
export type CaseMode = "solid" | "glass" | "open";
export type MotionState = "installing" | "removing";

export interface ActivityEntry {
  id: number;
  at: number;
  kind: "install" | "remove" | "success" | "warning" | "info";
  text: string;
}

/** Per-category change metadata: lets the renderer know whether to animate the latest change. */
export interface ChangeMeta {
  nonce: number;
  instant: boolean;
}

interface LastChange {
  category: ComponentCategory;
  previous: BuildSelection;
  componentId: string;
}

interface BuildState {
  selection: BuildSelection;
  buildName: string;
  changeMeta: Partial<Record<ComponentCategory, ChangeMeta>>;
  lastChange: LastChange | null;

  inspector: InspectorView;
  catalogCategory: ComponentCategory;
  focusComponentId: string | null;
  selectedSlot: string | null;
  hoveredSlot: string | null;
  view: { exploded: boolean; caseMode: CaseMode; labels: boolean };
  motion: Record<string, MotionState>;
  activity: ActivityEntry[];
  skipNonce: number;
  cameraNonce: number;
  perf: { gameId: string; settings: GameSettings; targetFps?: number };

  setComponent: (component: HardwareComponent, opts?: { instant?: boolean; ramCount?: number }) => void;
  /** Change how many memory modules are installed (1…board slots). */
  setRamCount: (count: number) => void;
  removeComponent: (category: ComponentCategory, id?: string) => void;
  loadSelection: (selection: BuildSelection, name?: string) => void;
  resetBuild: () => void;
  clearBuild: () => void;
  cancelInstall: (category: ComponentCategory) => void;
  setBuildName: (name: string) => void;

  setInspector: (v: InspectorView) => void;
  openCatalog: (category: ComponentCategory, focusId?: string | null) => void;
  selectSlot: (slot: string | null) => void;
  setHovered: (slot: string | null) => void;
  setView: (patch: Partial<BuildState["view"]>) => void;
  setMotion: (slot: string, state: MotionState | null) => void;
  log: (kind: ActivityEntry["kind"], text: string) => void;
  skipAnimations: () => void;
  resetCamera: () => void;
  setPerf: (patch: Partial<{ gameId: string; settings: Partial<GameSettings>; targetFps: number }>) => void;
}

const ALL_INSTANT: BuildState["changeMeta"] = {};

let activityId = 0;

function bump(meta: BuildState["changeMeta"], category: ComponentCategory, instant: boolean): BuildState["changeMeta"] {
  return { ...meta, [category]: { nonce: (meta[category]?.nonce ?? 0) + 1, instant } };
}

function allInstant(meta: BuildState["changeMeta"]): BuildState["changeMeta"] {
  const next = { ...meta };
  for (const c of ["case", "motherboard", "cpu", "cooler", "ram", "gpu", "storage", "psu", "fans"] as ComponentCategory[]) {
    next[c] = { nonce: (meta[c]?.nonce ?? 0) + 1, instant: true };
  }
  return next;
}

export const useBuildStore = create<BuildState>()(
  persist(
    (set, get) => ({
      selection: DEFAULT_SELECTION,
      buildName: DEFAULT_BUILD_NAME,
      changeMeta: ALL_INSTANT,
      lastChange: null,

      inspector: "catalog",
      catalogCategory: "gpu",
      focusComponentId: null,
      selectedSlot: null,
      hoveredSlot: null,
      view: { exploded: false, caseMode: "glass", labels: false },
      motion: {},
      activity: [],
      skipNonce: 0,
      cameraNonce: 0,
      perf: {
        gameId: "cyberpunk-2077",
        settings: { resolution: "1440p", preset: "high", rayTracing: false, upscaling: "off", upscaler: null, frameGen: false },
        targetFps: 144,
      },

      setComponent: (component, opts) => {
        const { selection, changeMeta } = get();
        const instant = Boolean(opts?.instant);
        let next: BuildSelection;
        if (component.category === "storage") {
          if (selection.storage.includes(component.id)) return;
          next = { ...selection, storage: [...selection.storage, component.id] };
        } else if (component.category === "ram") {
          const ramCount = normalizeRamCount(opts?.ramCount ?? selection.ramCount);
          if (selection.ram === component.id && selection.ramCount === ramCount) return;
          next = { ...selection, ram: component.id, ramCount };
        } else {
          if (selection[component.category] === component.id) return;
          next = { ...selection, [component.category]: component.id };
        }
        const previousId = component.category === "storage" ? null : selection[component.category];
        const prev = hardwareRepository.byId(previousId);
        const label = getMessages().categories[component.category];
        get().log("install", prev ? `${label}: замена ${prev.name} → ${component.name}` : `${label}: выбран ${component.name}`);
        set({
          selection: next,
          changeMeta: bump(changeMeta, component.category, instant),
          lastChange: { category: component.category, previous: selection, componentId: component.id },
          selectedSlot: component.category === "storage" ? `storage:${component.id}` : component.category,
        });
      },

      setRamCount: (count) => {
        const { selection, changeMeta } = get();
        const ramCount = normalizeRamCount(count);
        if (ramCount === selection.ramCount) return;
        set({ selection: { ...selection, ramCount }, changeMeta: bump(changeMeta, "ram", false), lastChange: null });
        get().log("install", `Оперативная память: модулей ${selection.ramCount} → ${ramCount}`);
      },

      removeComponent: (category, id) => {
        const { selection, changeMeta } = get();
        let next: BuildSelection;
        let removedId: string | null;
        if (category === "storage") {
          removedId = id ?? null;
          next = { ...selection, storage: selection.storage.filter((s) => s !== id) };
        } else {
          removedId = selection[category];
          next = { ...selection, [category]: null };
        }
        const removed = hardwareRepository.byId(removedId);
        if (removed) get().log("remove", `${getMessages().categories[category]}: извлечён ${removed.name}`);
        set({ selection: next, changeMeta: bump(changeMeta, category, false), lastChange: null, selectedSlot: null });
      },

      loadSelection: (selection, name) => {
        set((s) => ({
          selection,
          buildName: name ?? s.buildName,
          changeMeta: allInstant(s.changeMeta),
          lastChange: null,
          selectedSlot: null,
          motion: {},
        }));
        get().log("info", `Загружена сборка «${name ?? get().buildName}»`);
      },

      resetBuild: () => get().loadSelection(DEFAULT_SELECTION, DEFAULT_BUILD_NAME),
      clearBuild: () => {
        set((s) => ({ selection: EMPTY_SELECTION, changeMeta: allInstant(s.changeMeta), lastChange: null, selectedSlot: null, motion: {} }));
        get().log("info", "Сборка очищена");
      },

      cancelInstall: (category) => {
        const { lastChange, changeMeta, selection } = get();
        if (!lastChange || lastChange.category !== category) return;
        const restored: BuildSelection =
          category === "storage"
            ? { ...selection, storage: selection.storage.filter((s) => s !== lastChange.componentId) }
            : category === "ram"
              ? { ...selection, ram: lastChange.previous.ram, ramCount: lastChange.previous.ramCount }
              : { ...selection, [category]: lastChange.previous[category] };
        set({ selection: restored, changeMeta: bump(changeMeta, category, true), lastChange: null });
        get().log("warning", `${getMessages().categories[category]}: установка отменена`);
      },

      setBuildName: (buildName) => set({ buildName }),

      setInspector: (inspector) => set({ inspector }),
      openCatalog: (catalogCategory, focusId = null) => set({ inspector: "catalog", catalogCategory, focusComponentId: focusId }),
      selectSlot: (selectedSlot) => set({ selectedSlot }),
      setHovered: (hoveredSlot) => set({ hoveredSlot }),
      setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),
      setMotion: (slot, state) =>
        set((s) => {
          const motion = { ...s.motion };
          if (state) motion[slot] = state;
          else delete motion[slot];
          return { motion };
        }),
      log: (kind, text) =>
        set((s) => ({ activity: [{ id: ++activityId, at: Date.now(), kind, text }, ...s.activity].slice(0, 40) })),
      skipAnimations: () => set((s) => ({ skipNonce: s.skipNonce + 1 })),
      resetCamera: () => set((s) => ({ cameraNonce: s.cameraNonce + 1 })),
      setPerf: (patch) =>
        set((s) => ({
          perf: {
            gameId: patch.gameId ?? s.perf.gameId,
            settings: { ...s.perf.settings, ...patch.settings },
            targetFps: patch.targetFps ?? s.perf.targetFps ?? 144,
          },
        })),
    }),
    {
      // v2: catalogue ids changed (components/PcComponents) and RAM became per-module + count.
      name: "buildai.current-build.v2",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ selection: s.selection, buildName: s.buildName, view: s.view, perf: s.perf }),
      onRehydrateStorage: () => (state) => {
        // Restored builds appear in place without replaying install animations.
        if (state) useBuildStore.setState({ changeMeta: allInstant(state.changeMeta) });
      },
    },
  ),
);
