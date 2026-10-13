"use client";

import { BuildSidebar } from "./BuildSidebar";
import { BuildTimeline } from "./BuildTimeline";
import { ConflictDialog } from "./ConflictDialog";
import { InspectorPanel } from "./InspectorPanel";
import { SceneViewport } from "./scene/SceneViewport";

/**
 * Desktop: sidebar | 3D workspace + timeline | inspector, filling the viewport.
 * Below lg: scene first, then inspector and build summary in normal page flow.
 */
export function BuilderWorkspace() {
  return (
    <div className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:flex-none lg:h-[calc(100dvh-var(--nav-h))] lg:grid-rows-[minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)_380px] xl:grid-cols-[260px_minmax(0,1fr)_400px]">
      <div className="order-3 min-h-0 border-t border-line lg:order-none lg:border-t-0">
        <BuildSidebar />
      </div>
      <div className="order-1 flex min-h-0 flex-col lg:order-none">
        <div className="relative h-[62dvh] min-h-[360px] lg:h-auto lg:min-h-0 lg:flex-1">
          <SceneViewport />
        </div>
        <BuildTimeline />
      </div>
      <div className="order-2 h-[70dvh] min-h-0 border-t border-line lg:order-none lg:h-auto lg:border-t-0">
        <InspectorPanel />
      </div>
      <ConflictDialog />
    </div>
  );
}
