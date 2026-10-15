"use client";

import { useEffect, useState } from "react";
import type { PublicBrowserResult } from "@/lib/browser-bench/submission";
import { Badge, Button, SectionTitle, Select } from "@/components/ui/primitives";

type Api = (path: string, init?: RequestInit) => Promise<Response>;
type Row = PublicBrowserResult & { windowFps: number[]; issues: string[]; durationMs: number; hasAuthor: boolean };

const ANOMALY_TEXT: Record<string, string> = {
  software: "программный рендеринг",
  unstable: "нестабильные кадры",
  throttling: "падение к концу теста",
  "high-fps": "очень высокий FPS",
  "low-frames": "мало кадров",
};

/** Admin: review queue for published browser benchmark results (mode B). */
export function BrowserResultsSection({ api }: { api: Api }) {
  const [status, setStatus] = useState<"unverified" | "verified" | "rejected" | "any">("unverified");
  const [data, setData] = useState<{ items: Row[]; total: number; currentVersion: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    api(`/api/admin/browser-results?status=${status}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
        setData(body as typeof data);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [api, status, nonce]);

  const setRowStatus = async (id: string, next: "verified" | "rejected") => {
    const r = await api("/api/admin/browser-results", { method: "PATCH", body: JSON.stringify({ id, status: next }) });
    if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
    setNonce((n) => n + 1);
  };

  return (
    <section className="rounded-[var(--radius-lg)] border border-line bg-panel p-4">
      <SectionTitle aside={data ? <span className="text-[11px] text-fg-3">Всего: {data.total}</span> : undefined}>Браузерные тесты · очередь проверки</SectionTitle>
      <p className="mt-1 text-[12px] text-fg-3">Результаты теста «Проверить этот компьютер», опубликованные пользователями. Сервер уже проверил согласованность статистики; подтверждайте только правдоподобные результаты без аномалий.</p>
      <div className="mt-2 w-48">
        <Select
          label="Статус"
          value={status}
          onChange={setStatus}
          options={[
            { value: "unverified", label: "на проверке" },
            { value: "verified", label: "проверенные" },
            { value: "rejected", label: "отклонённые" },
            { value: "any", label: "все" },
          ]}
        />
      </div>
      {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
      {!data ? (
        !error && <p className="mt-2 text-[12px] text-fg-3">Загрузка…</p>
      ) : data.items.length === 0 ? (
        <p className="mt-2 text-[12px] text-fg-3">Нет результатов.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12px]">
            <thead className="text-[11px] text-fg-3">
              <tr>
                <th className="py-1 text-left font-medium">Дата</th>
                <th className="py-1 text-left font-medium">Версия · API · нагрузка · режим</th>
                <th className="py-1 text-left font-medium">Медиана / 1% / CV</th>
                <th className="py-1 text-left font-medium">Устройство</th>
                <th className="py-1 text-left font-medium">Аномалии</th>
                <th className="py-1 text-left font-medium">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="num py-1.5">{new Date(r.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="py-1.5">
                    {r.version}
                    {r.version !== data.currentVersion && <Badge tone="warn">старая версия</Badge>} · {r.backend} · {r.preset} · {r.mode}
                  </td>
                  <td className="num py-1.5">
                    {r.medianFps} / {r.p1LowFps} / {Math.round(r.cv * 100)}%
                  </td>
                  <td className="py-1.5">
                    {r.gpuRenderer ?? "GPU не указан"}
                    <span className="block text-fg-3">
                      {r.browser}, {r.os}
                    </span>
                  </td>
                  <td className="py-1.5">{r.anomalies.length ? r.anomalies.map((a) => ANOMALY_TEXT[a] ?? a).join(", ") : "—"}</td>
                  <td className="py-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge tone={r.status === "verified" ? "cyan" : r.status === "rejected" ? "warn" : "neutral"}>{r.status === "verified" ? "проверено" : r.status === "rejected" ? "отклонено" : "на проверке"}</Badge>
                      {r.status !== "verified" && (
                        <Button size="sm" onClick={() => setRowStatus(r.id, "verified")}>
                          Подтвердить
                        </Button>
                      )}
                      {r.status !== "rejected" && (
                        <Button size="sm" variant="danger" onClick={() => setRowStatus(r.id, "rejected")}>
                          Отклонить
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
