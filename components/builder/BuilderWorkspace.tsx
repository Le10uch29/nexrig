"use client";

import { useBuildStore } from "@/features/build-state/store";
import { cx } from "@/components/ui/primitives";
import { BuildHeaderBar } from "./BuildHeaderBar";
import { ConfiguratorRail } from "./ConfiguratorRail";
import { ConflictDialog } from "./ConflictDialog";
import { InspectorPanel } from "./InspectorPanel";
import { SceneViewport } from "./scene/SceneViewport";

/**
 * The builder screen: a build status bar on top, then configurator | 3D scene | inspector.
 * The scene takes the remaining width and the full height; both side panels collapse
 * (the configurator to a thumbnail rail, the inspector completely).
 * Below lg: status bar, scene, inspector and configurator follow each other.
 */
export function BuilderWorkspace() {
  const leftOpen = useBuildStore((s) => s.view.leftPanel ?? true);
  const rightOpen = useBuildStore((s) => s.view.rightPanel ?? true);
  return (
    <div className="flex flex-1 flex-col lg:h-[calc(100dvh-var(--nav-h))] lg:min-h-0 lg:flex-none">
      <BuildHeaderBar />
      <div
        className="panel-transition flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-rows-[minmax(0,1fr)] lg:[grid-template-columns:var(--cols)]"
        style={{ "--cols": `${leftOpen ? "clamp(248px,20vw,300px)" : "64px"} minmax(0,1fr) ${rightOpen ? "clamp(320px,28vw,420px)" : "0px"}` } as React.CSSProperties}
      >
        <div className="order-3 min-h-0 border-t border-line lg:order-none lg:border-t-0">
          <div className="lg:hidden">
            <ConfiguratorRail />
          </div>
          <div className="hidden h-full lg:block">
            <ConfiguratorRail collapsed={!leftOpen} />
          </div>
        </div>
        <div className="relative order-1 h-[58dvh] min-h-[360px] lg:order-none lg:h-auto lg:min-h-0">
          <SceneViewport />
        </div>
        <div className={cx("order-2 h-[72dvh] min-h-0 overflow-hidden border-t border-line lg:order-none lg:h-auto lg:border-t-0", !rightOpen && "lg:invisible")}>
          <InspectorPanel />
        </div>
      </div>
      <ConflictDialog />
    </div>
  );
}
