"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { GAMES } from "@/data/games";
import { useMeasuredBenchmarks } from "@/features/benchmarks/measured-store";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { formatPrice, useMessages } from "@/lib/i18n";
import type { CoordinatorResponse } from "@/types/agents";
import { IconAlert, IconSend, IconSpark } from "@/components/ui/icons";
import { Badge, Button, cx, inputCls, SectionTitle, StatusPill } from "@/components/ui/primitives";
import { AgentCard } from "./AgentCard";

interface Turn {
  id: number;
  question: string;
  status: "pending" | "done" | "error";
  response?: CoordinatorResponse;
  error?: string;
}

const QUICK = [
  "Оцени мою сборку и скажи, что улучшить в первую очередь",
  "Хватит ли блока питания и что с разъёмами видеокарты?",
  "Какой апгрейд даст больше всего FPS за свои деньги?",
  "Сколько FPS ожидать и что ограничивает производительность?",
];

/** Renders **bold** and "• " / "- " bullet lines as React elements (no raw HTML). */
function RichText({ text }: { text: string }) {
  const inline = (s: string, key: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={`${key}-${i}`} className="font-semibold text-fg">{part.slice(2, -2)}</strong> : <span key={`${key}-${i}`}>{part}</span>,
    );
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      const items = bullets;
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-5">
          {items.map((b, i) => (
            <li key={i}>{inline(b, `b${blocks.length}-${i}`)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  text.split("\n").forEach((line, i) => {
    const m = line.match(/^\s*(?:[•\-*]|\d+[.)])\s+(.*)$/);
    if (m) bullets.push(m[1]);
    else {
      flush();
      if (line.trim()) blocks.push(<p key={`p-${i}`}>{inline(line.replace(/^#+\s*/, ""), `p${i}`)}</p>);
    }
  });
  flush();
  return <div className="space-y-2 text-[13px] leading-relaxed text-fg-2">{blocks}</div>;
}

export function ExpertView() {
  const t = useMessages();
  const { selection, resolved, report, total } = useBuildDerived();
  const perf = useBuildStore((s) => s.perf);
  const measured = useMeasuredBenchmarks((s) => s.records);
  const [status, setStatus] = useState<{ llmConfigured: boolean; model: string | null } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const busy = turns.some((x) => x.status === "pending");

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ llmConfigured: false, model: null }));
  }, []);

  useEffect(() => {
    // Braces matter: smooth scrollIntoView can return a Promise, which must not become the effect cleanup.
    void endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const ask = async (question: string) => {
    const id = Date.now();
    setTurns((ts) => [...ts, { id, question, status: "pending" }]);
    setQ("");
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          selection,
          gameId: perf.gameId,
          settings: perf.settings,
          measured: measured.map((m) => ({
            id: m.id,
            gameId: m.gameId,
            cpuId: m.cpuId,
            gpuId: m.gpuId,
            settings: m.settings,
            avgFps: m.avgFps,
            low1Fps: m.low1Fps,
            sourceLabel: m.source.label,
            sourceUrl: m.source.url ?? "",
            testDate: m.testDate,
            conditions: m.conditions,
            sampleCount: m.sampleCount,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      const response = (await res.json()) as CoordinatorResponse;
      setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, status: "done", response } : x)));
    } catch (e) {
      setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, status: "error", error: e instanceof Error ? e.message : "Ошибка сети" } : x)));
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-[1280px] gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex min-h-[70dvh] flex-col">
        <header className="mb-4 space-y-2">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <IconSpark className="text-violet" width={20} height={20} /> {t.nav.expert}
          </h1>
          {status === null ? (
            <div className="skeleton h-10 rounded-[var(--radius-md)]" />
          ) : status.llmConfigured ? (
            <p className="rounded-[var(--radius-md)] border border-ok/30 bg-ok-soft/50 px-3 py-2 text-xs text-fg-2">
              Live AI подключён ({status.model}). Модель формулирует ответ только из результатов детерминированных агентов; проверки совместимости остаются авторитетными.
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-warn/30 bg-warn-soft/50 px-3 py-2 text-xs leading-relaxed text-fg-2">
              <IconAlert className="mt-0.5 shrink-0 text-warn" />
              Live AI-анализ недоступен: на сервере не задан ANTHROPIC_API_KEY. Работает детерминированный координатор — он объединяет результаты агентов совместимости, бенчмарков, апгрейда и цен без генерации нового содержания.
            </p>
          )}
        </header>

        <div className="flex-1 space-y-5">
          {turns.length === 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {QUICK.map((x) => (
                <button key={x} type="button" disabled={busy} onClick={() => ask(x)} className="rounded-[var(--radius-md)] border border-line bg-panel p-3 text-left text-[12.5px] text-fg-2 transition-colors hover:border-violet/40 hover:text-fg">
                  {x}
                </button>
              ))}
            </div>
          )}
          {turns.map((turn) => (
            <div key={turn.id} className="space-y-3">
              <p className="ml-auto max-w-[85%] rounded-[var(--radius-lg)] rounded-br-sm bg-violet-strong/90 px-3.5 py-2 text-[13px] text-white">{turn.question}</p>
              {turn.status === "pending" && (
                <div className="space-y-2" role="status" aria-label="Агенты анализируют сборку">
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-4 w-1/2 rounded" />
                </div>
              )}
              {turn.status === "error" && <p className="text-xs text-bad" role="alert">Не удалось получить ответ: {turn.error}</p>}
              {turn.response && (
                <div className="space-y-3 rounded-[var(--radius-lg)] border border-line bg-panel p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={turn.response.mode === "llm" ? "violet" : "neutral"}>{turn.response.mode === "llm" ? `AI · ${turn.response.model}` : "Детерминированный ответ"}</Badge>
                    <span className="text-[11px] text-fg-3">{new Date(turn.response.generatedAt).toLocaleTimeString("ru-RU")}</span>
                  </div>
                  {turn.response.notice && <p className="text-[11.5px] text-warn">{turn.response.notice}</p>}
                  <RichText text={turn.response.answer} />
                  <details className="group">
                    <summary className="cursor-pointer text-[11.5px] text-fg-3 select-none hover:text-fg-2">Результаты агентов ({turn.response.agents.length})</summary>
                    <div className="mt-2 space-y-2">
                      {turn.response.agents.map((a) => (
                        <AgentCard key={a.agent} result={a} />
                      ))}
                    </div>
                  </details>
                </div>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form
          className="sticky bottom-0 mt-4 flex gap-2 border-t border-line bg-bg-0/95 py-3 backdrop-blur"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim() && !busy) void ask(q.trim());
          }}
        >
          <label htmlFor="expert-q" className="sr-only">
            Вопрос эксперту
          </label>
          <input id="expert-q" value={q} onChange={(e) => setQ(e.target.value)} maxLength={2000} placeholder="Спросите о совместимости, FPS, апгрейде или цене…" className={cx(inputCls, "h-10")} />
          <Button type="submit" variant="primary" disabled={busy || !q.trim()} className="h-10" aria-label="Отправить">
            <IconSend />
          </Button>
        </form>
      </section>

      <aside className="space-y-3 lg:sticky lg:top-[calc(var(--nav-h)+24px)] lg:self-start">
        <SectionTitle>Контекст анализа</SectionTitle>
        <div className="space-y-2 rounded-[var(--radius-md)] border border-line bg-panel p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-fg-3">Совместимость</span>
            <StatusPill status={report.overall} size="xs" />
          </div>
          <div className="flex justify-between">
            <span className="text-fg-3">Сумма (демо)</span>
            <span className="num">{formatPrice(total)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-fg-3">Игра</span>
            <span className="truncate text-right">{GAMES.find((g) => g.id === perf.gameId)?.title}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-3">Настройки</span>
            <span>
              {perf.settings.resolution} · {t.perf.presets[perf.settings.preset]}
            </span>
          </div>
          <ul className="space-y-0.5 border-t border-line pt-2 text-fg-2">
            <li className="truncate">CPU: {resolved.cpu?.name ?? "—"}</li>
            <li className="truncate">GPU: {resolved.gpu?.name ?? "—"}</li>
            <li className="truncate">RAM: {resolved.ram?.name ?? "—"}</li>
            <li className="truncate">БП: {resolved.psu?.name ?? "—"}</li>
          </ul>
        </div>
        <p className="text-[11px] leading-relaxed text-fg-3">
          Агенты: совместимость, бенчмарки, апгрейд, цены, координатор. Все инструменты — локальные функции; внешние источники цен и бенчмарков не подключены.
        </p>
      </aside>
    </div>
  );
}
