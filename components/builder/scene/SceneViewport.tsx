"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore, type CaseMode } from "@/features/build-state/store";
import { useMessages } from "@/lib/i18n";
import type { ComponentCategory } from "@/types/hardware";
import { IconAlert, IconExplode, IconLayers, IconReset, IconSkip, IconTag, IconX } from "@/components/ui/icons";
import { Button, cx, IconButton, Segmented } from "@/components/ui/primitives";
import { TestPcButton } from "@/components/fps-analysis/TestPcButton";
import { SceneLabels } from "./SceneLabels";

const PcScene = dynamic(() => import("./PcScene"), { ssr: false, loading: () => <SceneLoading /> });

function SceneLoading() {
  const t = useMessages();
  return (
    <div className="absolute inset-0 grid place-items-center" role="status">
      <div className="flex flex-col items-center gap-3">
        <div className="size-9 animate-spin rounded-full border-2 border-line-strong border-t-violet" />
        <p className="text-xs text-fg-3">{t.scene.loading}</p>
      </div>
    </div>
  );
}

class SceneErrorBoundary extends Component<{ children: ReactNode; fallback: (retry: () => void) => ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? this.props.fallback(() => this.setState({ error: false })) : this.props.children;
  }
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

let webglSupport: boolean | undefined;
function detectWebGL(): boolean {
  if (webglSupport === undefined) {
    try {
      const c = document.createElement("canvas");
      webglSupport = Boolean(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

const noopSubscribe = () => () => {};

/** "checking" during SSR/hydration, then the cached client capability. */
function useWebGLStatus(): "checking" | "ok" | "unavailable" {
  return useSyncExternalStore(
    noopSubscribe,
    () => (detectWebGL() ? "ok" : "unavailable"),
    () => "checking",
  );
}

const REQUIRED: ComponentCategory[] = ["case", "motherboard", "cpu", "cooler", "ram", "gpu", "storage", "psu"];

export function SceneViewport() {
  const t = useMessages();
  const ref = useRef<HTMLDivElement>(null);
  const webgl = useWebGLStatus();
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const reducedMotion = useReducedMotion();

  // Stop rendering when the viewport is scrolled away or the tab is hidden.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.01 });
    io.observe(el);
    const onVis = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div ref={ref} className="workspace-bg relative h-full min-h-[320px] w-full overflow-hidden">
      {webgl === "checking" && <SceneLoading />}
      {webgl === "unavailable" && <WebglFallback />}
      {webgl === "ok" && (
        <SceneErrorBoundary
          fallback={(retry) => (
            <div className="absolute inset-0 grid place-items-center p-6">
              <div className="max-w-sm text-center">
                <IconAlert className="mx-auto mb-2 text-warn" width={22} height={22} />
                <p className="text-sm font-medium">{t.scene.renderError}</p>
                <p className="mt-1 text-xs text-fg-3">{t.scene.webglUnavailableHint}</p>
                <Button className="mt-4" size="sm" onClick={retry}>
                  {t.scene.retry}
                </Button>
              </div>
            </div>
          )}
        >
          <PcScene active={visible && pageVisible} reducedMotion={reducedMotion} />
        </SceneErrorBoundary>
      )}
      {webgl === "ok" && <SceneLabels />}
      <SceneToolbar />
      <ProgressCard />
      <TestPcButton />
      <MotionBanner />
      <ActivityPanel />
      <p className="pointer-events-none absolute right-3 bottom-3 hidden max-w-[300px] text-right text-[10.5px] leading-snug text-fg-3 md:block">
        {t.scene.hint}
        <br />
        {t.scene.proceduralNote}
      </p>
    </div>
  );
}

function WebglFallback() {
  const t = useMessages();
  const { placements } = useBuildDerived();
  return (
    <div className="absolute inset-0 overflow-auto p-6 pt-16">
      <div className="mx-auto max-w-md rounded-[var(--radius-lg)] border border-line bg-panel p-5">
        <div className="flex items-center gap-2 text-warn">
          <IconAlert />
          <p className="text-sm font-semibold">{t.scene.webglUnavailable}</p>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-fg-3">{t.scene.webglUnavailableHint}</p>
        <ul className="mt-4 space-y-1.5">
          {placements
            .filter((p) => p.category !== "case")
            .map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-fg-2">{t.categories[p.category]}</span>
                <span className={p.state === "mounted" ? "text-ok" : "text-warn"}>{p.state === "mounted" ? t.timeline.installed : t.scene.parked}</span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

function SceneToolbar() {
  const t = useMessages();
  const view = useBuildStore((s) => s.view);
  const setView = useBuildStore((s) => s.setView);
  const resetCamera = useBuildStore((s) => s.resetCamera);
  return (
    <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-line bg-panel/85 p-1 backdrop-blur">
        <IconLayers className="ml-1.5 text-fg-3" />
        <Segmented<CaseMode>
          size="sm"
          label={t.scene.caseMode}
          value={view.caseMode}
          onChange={(caseMode) => setView({ caseMode })}
          options={[
            { value: "solid", label: t.scene.caseSolid },
            { value: "glass", label: t.scene.caseGlass },
            { value: "open", label: t.scene.caseOpen },
          ]}
        />
      </div>
      <IconButton label={t.scene.exploded} active={view.exploded} onClick={() => setView({ exploded: !view.exploded })}>
        <IconExplode />
      </IconButton>
      <IconButton label={t.scene.labels} active={view.labels} onClick={() => setView({ labels: !view.labels })}>
        <IconTag />
      </IconButton>
      <IconButton label={t.scene.resetCamera} onClick={resetCamera}>
        <IconReset />
      </IconButton>
    </div>
  );
}

function ProgressCard() {
  const t = useMessages();
  const { placements } = useBuildDerived();
  const motion = useBuildStore((s) => s.motion);
  const done = REQUIRED.filter((cat) => {
    const ps = placements.filter((p) => p.category === cat);
    return ps.length > 0 && ps.every((p) => p.state === "mounted" && !motion[p.key]);
  }).length;
  const pct = Math.round((done / REQUIRED.length) * 100);
  return (
    <div className="absolute top-14 right-3 w-40 rounded-[var(--radius-md)] sm:top-3 sm:w-48 border border-line bg-panel/85 px-3 py-2.5 backdrop-blur" aria-live="polite">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-fg-3">{t.scene.progress}</span>
        <span className="num text-xs text-fg">
          {done}/{REQUIRED.length}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={cx("h-full rounded-full transition-[width] duration-500", pct === 100 ? "bg-ok" : "bg-violet")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MotionBanner() {
  const t = useMessages();
  const motion = useBuildStore((s) => s.motion);
  const lastChange = useBuildStore((s) => s.lastChange);
  const skip = useBuildStore((s) => s.skipAnimations);
  const cancel = useBuildStore((s) => s.cancelInstall);
  const { placements } = useBuildDerived();
  const entries = Object.entries(motion);
  if (entries.length === 0) return null;
  const [key, kind] = entries[0];
  const p = placements.find((x) => x.key === key);
  const canCancel = kind === "installing" && p && lastChange?.category === p.category && lastChange.componentId === p.component.id;
  return (
    <div className="animate-in absolute top-32 left-1/2 sm:top-16 flex -translate-x-1/2 items-center gap-2 rounded-full border border-violet/40 bg-[#141128]/90 py-1 pr-1 pl-3 shadow-pop backdrop-blur" role="status">
      <span className="size-2 animate-pulse rounded-full bg-violet" />
      <span className="max-w-[46vw] truncate text-xs">
        {kind === "installing" ? t.scene.installing : t.scene.removing}: <span className="font-medium">{p?.component.name ?? "…"}</span>
      </span>
      <Button size="sm" variant="ghost" onClick={skip}>
        <IconSkip width={13} height={13} /> {t.scene.skip}
      </Button>
      {canCancel && (
        <Button size="sm" variant="ghost" onClick={() => cancel(p.category)}>
          <IconX width={13} height={13} /> {t.scene.cancel}
        </Button>
      )}
    </div>
  );
}

function ActivityPanel() {
  const t = useMessages();
  const activity = useBuildStore((s) => s.activity);
  const [open, setOpen] = useState(true);
  const fmt = (ms: number) => new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const color = { install: "bg-violet", remove: "bg-fg-3", success: "bg-ok", warning: "bg-warn", info: "bg-cyan" } as const;
  return (
    <div className="absolute bottom-3 left-3 w-[min(340px,calc(100%-24px))] rounded-[var(--radius-md)] border border-line bg-panel/85 backdrop-blur">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">
        {t.scene.activity}
        <span className="num normal-case">{activity.length}</span>
      </button>
      {open && (
        <ol className="scroll-thin max-h-32 space-y-1 overflow-auto px-3 pb-2.5" aria-live="polite">
          {activity.length === 0 && <li className="text-xs text-fg-3">{t.scene.noActivity}</li>}
          {activity.slice(0, 12).map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-[11.5px] leading-snug">
              <span className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", color[a.kind])} />
              <span className="num shrink-0 text-fg-3">{fmt(a.at)}</span>
              <span className="text-fg-2">{a.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
