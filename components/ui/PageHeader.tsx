import type { ReactNode } from "react";

/**
 * Page hero: section label (light breadcrumb), a large title, a readable description and a slot on
 * the right for page-specific context (current build, legend, actions).
 */
export function PageHeader({ section, title, description, aside, children }: { section?: string; title: string; description?: ReactNode; aside?: ReactNode; children?: ReactNode }) {
  return (
    <header className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="min-w-0 max-w-3xl space-y-3">
          {section && (
            <p className="eyebrow text-violet">
              NexRig <span aria-hidden className="text-fg-3">/</span> {section}
            </p>
          )}
          <h1 className="text-[32px] leading-[1.08] font-semibold tracking-[-0.025em] md:text-[44px]">{title}</h1>
          {description && <p className="text-[15px] leading-relaxed text-fg-2 md:text-[16px]">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </header>
  );
}
