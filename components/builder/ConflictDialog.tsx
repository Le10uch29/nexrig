"use client";

import { useConflictDialog } from "@/features/build-state/install-action";
import { useBuildStore } from "@/features/build-state/store";
import { useMessages } from "@/lib/i18n";
import { IconX } from "@/components/ui/icons";
import { Button, Dialog } from "@/components/ui/primitives";

export function ConflictDialog() {
  const t = useMessages();
  const pending = useConflictDialog((s) => s.pending);
  const close = useConflictDialog((s) => s.close);
  const setComponent = useBuildStore((s) => s.setComponent);
  return (
    <Dialog open={Boolean(pending)} onClose={close} title={t.conflict.title}>
      {pending && (
        <>
          <p className="text-sm font-medium">{pending.component.name}</p>
          <ul className="mt-3 space-y-2">
            {pending.checks.map((c) => (
              <li key={c.id} className="rounded-[var(--radius-md)] border border-bad/30 bg-bad-soft p-3 text-xs leading-relaxed">
                <p className="flex items-center gap-1.5 font-semibold text-bad">
                  <IconX width={13} height={13} /> {c.title}
                </p>
                <p className="mt-1 text-fg-2">{c.detail}</p>
                {c.resolution && (
                  <p className="mt-1 text-fg-3">
                    {t.compat.resolution}: {c.resolution}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-fg-3">{t.conflict.body}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={close} autoFocus>
              {t.conflict.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setComponent(pending.component);
                close();
              }}
            >
              {t.conflict.addAnyway}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
