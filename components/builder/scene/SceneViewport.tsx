"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore, type CaseMode } from "@/features/build-state/store";
import { useModelPreviews } from "@/features/models/preview";
import { useMessages } from "@/lib/i18n";
import { IconAlert, IconChevron, IconExplode, IconHelp, IconLayers, IconReset, IconSidebar, IconSkip, IconTag, IconX } from "@/components/ui/icons";
import { Button, cx, Segmented } from "@/components/ui/primitives";
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

/**
 * `environment` picks the 3D surroundings (workshop or showroom). `toolbar` shows the built-in
 * scene toolbar; `activity` the installation log and the imported-model banner. Pages with their
 * own scene controls turn the toolbar off.
 */
export function SceneViewport({ environment = "workshop", toolbar = environment === "workshop", activity = environment === "workshop" }: { environment?: "workshop" | "studio"; toolbar?: boolean; activity?: boolean }) {
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
    <div ref={ref} className="workspace-bg @container relative h-full min-h-[320px] w-full overflow-hidden">
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
          <PcScene active={visible && pageVisible} reducedMotion={reducedMotion} environment={environment} />
        </SceneErrorBoundary>
      )}
      {webgl === "ok" && <SceneLabels />}
      {toolbar && <SceneToolbar />}
      <MotionBanner />
      {activity && <ActivityPanel />}
      {activity && <PreviewBanner />}
    </div>
  );
}

/** Imported models attached from Studio: always visible here and removable in one click. */
function PreviewBanner() {
  const previews = useModelPreviews((s) => s.previews);
  const detach = useModelPreviews((s) => s.detach);
  const list = Object.values(previews);
  if (list.length === 0) return null;
  return (
    <div className="absolute bottom-3 left-1/2 flex w-max max-w-[min(420px,calc(100%-24px))] -translate-x-1/2 flex-col gap-1.5 @max-xl:bottom-14" role="status">
      {list.map((p) => (
        <div key={p.key} className="glass flex items-center gap-2 rounded-[var(--radius-md)] py-1.5 pr-1.5 pl-3 text-[12px] shadow-[var(--shadow-panel)]">
          <span className="size-2 shrink-0 rounded-full bg-violet" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            <span className="text-fg-3">Временная модель:</span> {p.fileName} → {p.componentName}
          </span>
          <Button size="sm" variant="ghost" onClick={() => detach(p.key)}>
            Отключить
          </Button>
        </div>
      ))}
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

/** One consistent button style for every scene control. */
function ToolButton({ label, active, onClick, children, className }: { label: string; active?: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        "grid size-8 place-items-center rounded-[var(--radius-sm)] transition-colors",
        active ? "bg-[var(--selected-bg)] text-violet" : "text-fg-2 hover:bg-[var(--hover-bg)] hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

function SceneToolbar() {
  const t = useMessages();
  const view = useBuildStore((s) => s.view);
  const setView = useBuildStore((s) => s.setView);
  const resetCamera = useBuildStore((s) => s.resetCamera);
  const [help, setHelp] = useState(false);
  const leftOpen = view.leftPanel ?? true;
  const rightOpen = view.rightPanel ?? true;
  return (
    <div className="absolute top-3 left-3 flex max-w-[calc(100%-24px)] flex-col items-start gap-2">
      <div className="glass flex flex-wrap items-center gap-0.5 rounded-[var(--radius-md)] p-1 shadow-[var(--shadow-panel)] @2xl:flex-nowrap" role="toolbar" aria-label="Управление сценой">
        <ToolButton label={leftOpen ? "Скрыть панель сборки" : "Показать панель сборки"} active={leftOpen} onClick={() => setView({ leftPanel: !leftOpen })} className="hidden lg:grid">
          <IconSidebar />
        </ToolButton>
        <span className="mx-0.5 hidden h-5 w-px bg-line lg:block" aria-hidden />
        <IconLayers className="mx-1 text-fg-3 @max-2xl:hidden" aria-hidden />
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
        <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
        <ToolButton label={t.scene.exploded} active={view.exploded} onClick={() => setView({ exploded: !view.exploded })}>
          <IconExplode />
        </ToolButton>
        <ToolButton label={t.scene.labels} active={view.labels} onClick={() => setView({ labels: !view.labels })}>
          <IconTag />
        </ToolButton>
        <ToolButton label={t.scene.resetCamera} onClick={resetCamera}>
          <IconReset />
        </ToolButton>
        <ToolButton label="Управление и подсказки" active={help} onClick={() => setHelp((v) => !v)}>
          <IconHelp />
        </ToolButton>
        <span className="mx-0.5 hidden h-5 w-px bg-line lg:block" aria-hidden />
        <ToolButton label={rightOpen ? "Скрыть панель комплектующих" : "Показать панель комплектующих"} active={rightOpen} onClick={() => setView({ rightPanel: !rightOpen })} className="hidden lg:grid">
          <IconSidebar className="-scale-x-100" />
        </ToolButton>
      </div>
      {help && (
        <div className="glass animate-in relative z-10 max-w-[320px] rounded-[var(--radius-md)] p-3 text-[11.5px] leading-relaxed text-fg-2 shadow-[var(--shadow-pop)]" role="note">
          <p>{t.scene.hint}</p>
          <p className="mt-1 text-fg-3">{t.scene.proceduralNote}</p>
        </div>
      )}
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
    <div className="glass animate-in absolute bottom-14 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full py-1 pr-1 pl-3 shadow-[var(--shadow-pop)]" role="status">
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

/** Installation log: a small pill by default, so it never covers the case. */
function ActivityPanel() {
  const t = useMessages();
  const activity = useBuildStore((s) => s.activity);
  const [open, setOpen] = useState(false);
  const fmt = (ms: number) => new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const color = { install: "bg-violet", remove: "bg-fg-3", success: "bg-ok", warning: "bg-warn", info: "bg-cyan" } as const;
  const last = activity[0];
  return (
    <div className={cx("glass absolute bottom-3 left-3 rounded-[var(--radius-md)] shadow-[var(--shadow-panel)]", open ? "w-[min(340px,calc(100%-24px))]" : "max-w-[min(340px,calc(100%-24px))]")}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-1.5 text-left">
        <span className="eyebrow">{t.scene.activity}</span>
        <span className="num text-[11px] text-fg-3">{activity.length}</span>
        {!open && last && <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-2">{last.text}</span>}
        <IconChevron width={12} height={12} className={cx("ml-auto shrink-0 text-fg-3 transition-transform", open ? "rotate-90" : "-rotate-90")} />
      </button>
      {open && (
        <ol className="scroll-thin animate-in max-h-40 space-y-1 overflow-auto px-3 pb-2.5" aria-live="polite">
          {activity.length === 0 && <li className="text-xs text-fg-3">{t.scene.noActivity}</li>}
          {activity.slice(0, 20).map((a) => (
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
