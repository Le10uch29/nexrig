"use client";

import { useBuildStore, type CaseMode } from "@/features/build-state/store";
import { IconExplode, IconHelp, IconLayers, IconList, IconReset, IconTag } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";
import { ToolButton } from "@/components/ui/studio";
import { useMessages } from "@/lib/i18n";
import { useState } from "react";
import { BuildHeaderBar } from "./BuildHeaderBar";
import { ConfiguratorRail } from "./ConfiguratorRail";
import { ConflictDialog } from "./ConflictDialog";
import { InspectorPanel } from "./InspectorPanel";
import { SceneViewport } from "./scene/SceneViewport";

const CASE_MODES: CaseMode[] = ["glass", "open", "solid"];

/** Scene controls as round glass buttons (replaces the workshop toolbar in the showroom layout). */
function ViewTools() {
  const t = useMessages();
  const view = useBuildStore((s) => s.view);
  const setView = useBuildStore((s) => s.setView);
  const resetCamera = useBuildStore((s) => s.resetCamera);
  const rightOpen = view.rightPanel ?? true;
  const [help, setHelp] = useState(false);
  const caseLabel = { solid: t.scene.caseSolid, glass: t.scene.caseGlass, open: t.scene.caseOpen }[view.caseMode];
  return (
    <div className="relative flex gap-2 lg:flex-col" role="toolbar" aria-label="Управление сценой">
      <ToolButton label={`${t.scene.caseMode}: ${caseLabel}`} onClick={() => setView({ caseMode: CASE_MODES[(CASE_MODES.indexOf(view.caseMode) + 1) % CASE_MODES.length] })}>
        <IconLayers width={18} height={18} />
      </ToolButton>
      <ToolButton label={t.scene.exploded} active={view.exploded} onClick={() => setView({ exploded: !view.exploded })}>
        <IconExplode width={18} height={18} />
      </ToolButton>
      <ToolButton label={t.scene.labels} active={view.labels} onClick={() => setView({ labels: !view.labels })}>
        <IconTag width={18} height={18} />
      </ToolButton>
      <ToolButton label={t.scene.resetCamera} onClick={resetCamera}>
        <IconReset width={18} height={18} />
      </ToolButton>
      <ToolButton label="Управление и подсказки" active={help} onClick={() => setHelp((v) => !v)}>
        <IconHelp width={18} height={18} />
      </ToolButton>
      <ToolButton label={rightOpen ? "Скрыть панель" : "Показать панель"} active={rightOpen} onClick={() => setView({ rightPanel: !rightOpen })} className="hidden lg:grid">
        <IconList width={18} height={18} />
      </ToolButton>
      {help && (
        <div className="glass animate-in absolute top-12 right-0 z-10 w-[min(300px,80vw)] rounded-[var(--radius-md)] p-3 text-[11.5px] leading-relaxed text-fg-2 shadow-[var(--shadow-pop)] lg:top-0 lg:right-12" role="note">
          <p>{t.scene.hint}</p>
          <p className="mt-1 text-fg-3">{t.scene.proceduralNote}</p>
        </div>
      )}
    </div>
  );
}

/**
 * The builder in the NexRig showroom layout: the 3D scene fills the screen; the build status sits
 * on top, the parts in installation order on the left and the inspector (catalog, compatibility,
 * FPS…) floats on the right. Below lg the same blocks follow each other.
 */
export function BuilderWorkspace() {
  const leftOpen = useBuildStore((s) => s.view.leftPanel ?? true);
  const rightOpen = useBuildStore((s) => s.view.rightPanel ?? true);
  return (
    <div className="relative flex flex-1 flex-col bg-bg-0 lg:h-[calc(100dvh-var(--nav-h))] lg:flex-none lg:overflow-hidden">
      <BuildHeaderBar />

      {/* scene: the centre of the screen */}
      <div className="relative h-[58dvh] min-h-[360px] lg:absolute lg:inset-0 lg:h-auto">
        <SceneViewport environment="workshop" toolbar={false} activity />
        {/* scrims keep the overlay text readable over a bright backdrop photo */}
        <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-52 bg-gradient-to-b from-bg-0 via-bg-0/70 to-transparent lg:block" aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[360px] bg-gradient-to-r from-bg-0 via-bg-0/80 to-transparent lg:block" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg-0/80 to-transparent" aria-hidden />
        <div className={cx("absolute top-3 right-3 lg:right-auto lg:top-[132px]", rightOpen ? "lg:left-[calc(100%-clamp(340px,27vw,420px)-24px-52px)]" : "lg:left-[calc(100%-24px-40px)]")}>
          <ViewTools />
        </div>
      </div>

      {/* parts in installation order */}
      <div className={cx("order-3 border-t border-line bg-bg-1 lg:absolute lg:top-[132px] lg:bottom-6 lg:left-6 lg:z-10 lg:flex lg:flex-col lg:justify-center lg:border-0 lg:bg-transparent", leftOpen ? "lg:w-[clamp(240px,19vw,290px)]" : "lg:w-12")}>
        <div className="lg:hidden">
          <ConfiguratorRail />
        </div>
        <div className="hidden min-h-0 lg:flex lg:flex-col">
          <ConfiguratorRail collapsed={!leftOpen} />
        </div>
      </div>

      {/* inspector: catalog, build, compatibility, FPS, upgrades, saved, compare */}
      <div
        className={cx(
          "order-2 h-[72dvh] min-h-0 overflow-hidden border-t border-line lg:absolute lg:top-[132px] lg:right-6 lg:bottom-6 lg:z-10 lg:h-auto lg:w-[clamp(340px,27vw,420px)] lg:rounded-[var(--radius-xl)] lg:border lg:bg-panel/88 lg:shadow-[var(--shadow-panel)] lg:backdrop-blur-xl",
          !rightOpen && "lg:hidden",
        )}
      >
        <InspectorPanel />
      </div>
      <ConflictDialog />
    </div>
  );
}
