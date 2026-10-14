"use client";

import Link from "next/link";
import { useState } from "react";
import { useAnalysis, type AnalysisRun } from "@/features/fps-analysis/store";
import { ANALYSIS_LEVEL_LABEL, ANALYSIS_RESOLUTIONS, TIER_LABEL, type GameReport, type ResolutionResult, type TestMatch } from "@/lib/fps-engine/analysis";
import { ANALYSIS_STAGES, STAGE_STATUS_LABEL, type StageStatus } from "@/lib/fps-engine/analysis-stages";
import type { FpsConfidenceLevel, Resolution } from "@/types/benchmark";
import { IconAlert, IconCheck, IconX } from "@/components/ui/icons";
import { Badge, Button, cx, Dialog, Select } from "@/components/ui/primitives";

const fmtDate = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const LEVEL_STYLE: Record<FpsConfidenceLevel, { dot: string; text: string }> = {
  verified: { dot: "bg-ok", text: "text-ok" },
  close: { dot: "bg-cyan", text: "text-cyan" },
  model: { dot: "bg-warn", text: "text-warn" },
  insufficient: { dot: "bg-fg-3", text: "text-fg-3" },
};

const CONFIDENCE_LABEL = { high: "высокая", medium: "средняя", low: "низкая" } as const;

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "running") return <span className="size-3.5 animate-spin rounded-full border-2 border-line-strong border-t-violet" aria-hidden />;
  if (status === "done") return <IconCheck width={14} height={14} className="text-ok" aria-hidden />;
  if (status === "error") return <IconX width={14} height={14} className="text-bad" aria-hidden />;
  if (status === "empty") return <span className="size-3.5 rounded-full border-2 border-fg-3/60" aria-hidden />;
  return <span className="size-3.5 rounded-full border-2 border-line" aria-hidden />;
}

function Stages() {
  const stages = useAnalysis((s) => s.stages);
  return (
    <ol className="space-y-1.5" aria-live="polite">
      {ANALYSIS_STAGES.map((st, i) => {
        const s = stages[st.id];
        return (
          <li key={st.id} className="flex items-start gap-2.5 text-[12px] leading-snug">
            <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
              <StageIcon status={s.status} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={cx("font-medium", s.status === "pending" ? "text-fg-3" : "text-fg")}>
                  {i + 1}. {st.label}
                </span>
                <span className={cx("text-[11px]", s.status === "error" ? "text-bad" : s.status === "done" ? "text-ok" : "text-fg-3")}>{STAGE_STATUS_LABEL[s.status]}</span>
              </div>
              {s.detail && <p className="text-[11px] text-fg-3">{s.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function RangeText({ r }: { r: ResolutionResult }) {
  if (!r.avg) return <span className="text-fg-3">—</span>;
  return (
    <span className="num">
      <span className="text-base font-semibold text-fg">{r.avg.mid}</span>
      {r.avg.low !== r.avg.high && (
        <span className="ml-1 text-[11px] text-fg-3">
          {r.avg.low}–{r.avg.high}
        </span>
      )}
    </span>
  );
}

function ResultsTable({ games, selected, onSelect }: { games: GameReport[]; selected: string | null; onSelect: (key: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line">
      <table className="w-full min-w-[560px] text-[12px]">
        <caption className="sr-only">Ожидаемый FPS по играм и разрешениям</caption>
        <thead className="bg-panel-2 text-[11px] text-fg-3">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Игра
            </th>
            {ANALYSIS_RESOLUTIONS.map((res) => (
              <th key={res} scope="col" className="px-3 py-2 text-left font-medium">
                {res} · средний FPS
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {games.map((g) => (
            <tr key={g.gameId}>
              <th scope="row" className="px-3 py-2 text-left font-medium text-fg-2">
                {g.title}
                <span className="block text-[10.5px] font-normal text-fg-3">версия {g.version}</span>
              </th>
              {g.results.map((r) => {
                const key = `${g.gameId}|${r.resolution}`;
                return (
                  <td key={r.resolution} className="px-1.5 py-1">
                    <button
                      type="button"
                      onClick={() => onSelect(key)}
                      aria-pressed={selected === key}
                      className={cx("w-full rounded-[var(--radius-sm)] px-1.5 py-1.5 text-left transition-colors", selected === key ? "bg-violet-soft/60 ring-1 ring-violet/40" : "hover:bg-panel-2")}
                    >
                      <RangeText r={r} />
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px]">
                        <span className={cx("size-1.5 rounded-full", LEVEL_STYLE[r.level].dot)} aria-hidden />
                        <span className={LEVEL_STYLE[r.level].text}>{ANALYSIS_LEVEL_LABEL[r.level]}</span>
                        {r.low1 && <span className="num text-fg-3">· 1% low {r.low1.low === r.low1.high ? r.low1.mid : `${r.low1.low}–${r.low1.high}`}</span>}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TestCard({ t }: { t: TestMatch }) {
  return (
    <li className={cx("rounded-[var(--radius-md)] border p-3 text-[11.5px]", t.used ? "border-line bg-panel-2/50" : "border-dashed border-line opacity-75")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={t.used ? "cyan" : "neutral"}>{t.used ? "использован" : "не использован"}</Badge>
        <span className="font-medium text-fg">
          Уровень {t.tier}: {TIER_LABEL[t.tier]}
        </span>
        {t.source.community && <Badge tone="violet">замер пользователя</Badge>}
      </div>
      {!t.used && t.excludedReason && <p className="mt-1 text-warn">Причина: {t.excludedReason}</p>}
      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        <div>
          <dt className="text-fg-3">Источник</dt>
          <dd>
            {t.source.url ? (
              <a href={t.source.url} target="_blank" rel="noopener noreferrer nofollow" className="text-violet underline-offset-2 hover:underline">
                {t.source.label}
              </a>
            ) : (
              t.source.label
            )}
            <span className="text-fg-3"> · {t.source.date}</span>
            {t.source.gameVersion && <span className="text-fg-3"> · версия игры {t.source.gameVersion}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-fg-3">Тестовый стенд</dt>
          <dd>
            {t.testSystem.cpu} + {t.testSystem.gpu}
            {t.testSystem.ram && `, ${t.testSystem.ram}`}
            <span className="block text-fg-3">{t.testSystem.settings}</span>
            {t.testSystem.config && <span className="block text-fg-3">{t.testSystem.config}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-fg-3">Измерено</dt>
          <dd className="num">
            {t.measured.avg} FPS{t.measured.low1 !== null && `, 1% low ${t.measured.low1}`}
            <span className="text-fg-3"> · прогонов {t.measured.samples}</span>
            {t.source.method && <span className="block text-fg-3">{t.source.method}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-fg-3">Для вашей сборки</dt>
          <dd className="num">
            {t.tier === 1 ? "без переноса" : `≈ ${t.transferred.avg} FPS${t.transferred.low1 !== null ? `, 1% low ≈ ${t.transferred.low1}` : ""}`}
            <span className="block text-fg-3">{t.transfer.method}</span>
          </dd>
        </div>
      </dl>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <p>
          <span className="text-fg-3">Совпадает: </span>
          {t.matched.join(", ")}
        </p>
        {t.differences.length > 0 && (
          <p>
            <span className="text-fg-3">Отличается: </span>
            {t.differences.join("; ")}
          </p>
        )}
      </div>
    </li>
  );
}

function Details({ game, r }: { game: GameReport; r: ResolutionResult }) {
  return (
    <section className="space-y-3 rounded-[var(--radius-md)] border border-line p-3" aria-label={`${game.title}, ${r.resolution}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {game.title} · {r.resolution}
        </h3>
        <span className="flex items-center gap-1.5 text-[11.5px]">
          <span className={cx("size-1.5 rounded-full", LEVEL_STYLE[r.level].dot)} aria-hidden />
          <span className={LEVEL_STYLE[r.level].text}>{ANALYSIS_LEVEL_LABEL[r.level]}</span>
          {r.confidence && <span className="text-fg-3">· уверенность {CONFIDENCE_LABEL[r.confidence]}</span>}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
        <div>
          <dt className="text-fg-3">Средний FPS{r.frameGen ? " (с FG)" : ""}</dt>
          <dd className="num font-semibold">{r.avg ? (r.avg.low === r.avg.high ? r.avg.mid : `${r.avg.low}–${r.avg.high} (≈${r.avg.mid})`) : "—"}</dd>
        </div>
        <div>
          <dt className="text-fg-3">1% low</dt>
          <dd className="num font-semibold">{r.low1 ? (r.low1.low === r.low1.high ? r.low1.mid : `${r.low1.low}–${r.low1.high}`) : "не измерен"}</dd>
        </div>
        <div>
          <dt className="text-fg-3">Ограничение</dt>
          <dd>{r.bottleneck === "cpu" ? "процессор" : r.bottleneck === "gpu" ? "видеокарта" : r.bottleneck === "balanced" ? "сбалансировано" : "—"}</dd>
        </div>
        <div>
          <dt className="text-fg-3">Тестов использовано</dt>
          <dd className="num">
            {r.tests.filter((t) => t.used).length} из {r.tests.length}
          </dd>
        </div>
      </dl>
      <ul className="list-disc space-y-0.5 pl-4 text-[11.5px] text-fg-2">
        {r.reasons.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      {r.tests.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Похожие тестовые системы</h4>
          <ul className="space-y-2">
            {r.tests.map((t) => (
              <TestCard key={t.recordId} t={t} />
            ))}
          </ul>
        </div>
      )}
      <details className="text-[11.5px]">
        <summary className="cursor-pointer text-fg-2">Журнал расчёта ({r.log.length})</summary>
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-fg-3">
          {r.log.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
      </details>
      {r.limitations.length > 0 && (
        <details className="text-[11.5px]">
          <summary className="cursor-pointer text-fg-2">Допущения и ограничения ({r.limitations.length})</summary>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-fg-3">
            {r.limitations.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Compare({ current, history }: { current: AnalysisRun; history: AnalysisRun[] }) {
  const others = history.filter((h) => h.frozen.version !== current.frozen.version);
  const [otherVersion, setOther] = useState(others[0]?.frozen.version ?? "");
  const [res, setRes] = useState<Resolution>("1440p");
  const other = others.find((h) => h.frozen.version === otherVersion) ?? others[0];
  if (!other) return <p className="text-[12px] text-fg-3">Запустите тест для другой сборки — её можно будет сравнить с этой.</p>;
  const label = (r: AnalysisRun) => `${r.frozen.buildName} · ${r.report.target.cpu} + ${r.report.target.gpu}`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[220px] flex-1">
          <Select label="Сравнить с" value={other.frozen.version} onChange={setOther} options={others.map((o) => ({ value: o.frozen.version, label: label(o) }))} />
        </div>
        <Select<Resolution> label="Разрешение" value={res} onChange={setRes} options={ANALYSIS_RESOLUTIONS.map((r) => ({ value: r, label: r }))} />
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line">
        <table className="w-full min-w-[460px] text-[12px]">
          <thead className="bg-panel-2 text-[11px] text-fg-3">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Игра ({res})</th>
              <th className="px-3 py-2 text-left font-medium">Эта сборка</th>
              <th className="px-3 py-2 text-left font-medium">Другая сборка</th>
              <th className="px-3 py-2 text-left font-medium">Разница</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {current.report.games.map((g) => {
              const a = g.results.find((r) => r.resolution === res);
              const b = other.report.games.find((x) => x.gameId === g.gameId)?.results.find((r) => r.resolution === res);
              const delta = a?.avg && b?.avg ? a.avg.mid / b.avg.mid - 1 : null;
              return (
                <tr key={g.gameId}>
                  <td className="px-3 py-1.5 text-fg-2">{g.title}</td>
                  <td className="num px-3 py-1.5">{a?.avg ? `${a.avg.mid} (${ANALYSIS_LEVEL_LABEL[a.level].toLowerCase()})` : "—"}</td>
                  <td className="num px-3 py-1.5">{b?.avg ? `${b.avg.mid} (${ANALYSIS_LEVEL_LABEL[b.level].toLowerCase()})` : "—"}</td>
                  <td className="num px-3 py-1.5">{delta === null ? "—" : `${delta >= 0 ? "+" : ""}${Math.round(delta * 100)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-fg-3">Разница сопоставима, только когда обе оценки одного уровня; у модельных оценок погрешность ±25%.</p>
    </div>
  );
}

export function AnalysisDialog() {
  const open = useAnalysis((s) => s.open);
  const setOpen = useAnalysis((s) => s.setOpen);
  const status = useAnalysis((s) => s.status);
  const frozen = useAnalysis((s) => s.frozen);
  const run = useAnalysis((s) => s.run);
  const error = useAnalysis((s) => s.error);
  const history = useAnalysis((s) => s.history);
  const cancel = useAnalysis((s) => s.cancel);
  const retry = useAnalysis((s) => s.retry);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"report" | "compare">("report");

  const [gameId, res] = selected?.split("|") ?? [];
  const game = run?.report.games.find((g) => g.gameId === gameId);
  const cell = game?.results.find((r) => r.resolution === res);

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Тест производительности ПК" className="max-h-[calc(100dvh-24px)] w-[min(1120px,calc(100vw-16px))] overflow-auto">
      <div className="space-y-4">
        {frozen && (
          <div className="rounded-[var(--radius-md)] border border-line bg-panel-2/40 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[12px] font-semibold">{frozen.buildName}</p>
              <p className="num text-[11px] text-fg-3">
                версия {frozen.version} · зафиксирована {fmtDate(frozen.frozenAt)}
              </p>
            </div>
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-[11.5px] sm:grid-cols-2 lg:grid-cols-3">
              {frozen.parts.map((p) => (
                <div key={p.label} className="flex gap-2">
                  <dt className="shrink-0 text-fg-3">{p.label}:</dt>
                  <dd className="text-fg-2">{p.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-fg-3">Изменения в конструкторе после запуска не влияют на этот тест — запустите его заново.</p>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-3">
            <Stages />
            <div className="flex flex-wrap gap-2">
              {status === "running" ? (
                <Button size="sm" variant="danger" onClick={cancel}>
                  Отменить
                </Button>
              ) : (
                <Button size="sm" onClick={retry} disabled={!frozen}>
                  Повторить анализ
                </Button>
              )}
              <Link href="/games" className="inline-flex h-7 items-center rounded-[var(--radius-sm)] px-2.5 text-xs text-fg-2 hover:bg-panel-2 hover:text-fg">
                Открыть FPS Lab
              </Link>
            </div>
            {status === "cancelled" && <p className="text-[12px] text-fg-3">Анализ отменён.</p>}
            {status === "error" && (
              <p className="flex items-start gap-1.5 text-[12px] text-bad" role="alert">
                <IconAlert width={14} height={14} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}
          </div>

          <div className="min-w-0 space-y-3">
            {!run && status === "running" && <p className="text-[12px] text-fg-3">Идёт поиск тестов и расчёт…</p>}
            {run && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                  {run.cached ? <Badge tone="warn">из кэша · {run.cachedAt ? fmtDate(run.cachedAt) : ""}</Badge> : <Badge tone="cyan">рассчитано {fmtDate(run.report.generatedAt)}</Badge>}
                  {(Object.keys(run.report.counts) as FpsConfidenceLevel[]).map((lvl) => (
                    <span key={lvl} className="flex items-center gap-1">
                      <span className={cx("size-1.5 rounded-full", LEVEL_STYLE[lvl].dot)} aria-hidden />
                      {ANALYSIS_LEVEL_LABEL[lvl]}: <span className="num">{run.report.counts[lvl]}</span>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1 border-b border-line" role="tablist">
                  {(
                    [
                      ["report", "Отчёт"],
                      ["compare", "Сравнить сборки"],
                    ] as const
                  ).map(([id, label]) => (
                    <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx("-mb-px border-b-2 px-3 py-1.5 text-[12px]", tab === id ? "border-violet text-fg" : "border-transparent text-fg-3 hover:text-fg")}>
                      {label}
                    </button>
                  ))}
                </div>
                {tab === "compare" ? (
                  <Compare current={run} history={history} />
                ) : (
                  <>
                    {[...run.frozen.caveats, ...run.report.limitations].length > 0 && (
                      <ul className="space-y-1 rounded-[var(--radius-md)] border border-warn/30 bg-warn-soft/40 p-2.5 text-[11.5px] text-fg-2">
                        {[...run.frozen.caveats, ...run.report.limitations].map((x) => (
                          <li key={x} className="flex gap-1.5">
                            <IconAlert width={13} height={13} className="mt-0.5 shrink-0 text-warn" />
                            {x}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[11.5px] text-fg-3">Нажмите на ячейку, чтобы открыть источники, похожие системы и журнал расчёта.</p>
                    <ResultsTable games={run.report.games} selected={selected} onSelect={setSelected} />
                    {game && cell && <Details game={game} r={cell} />}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <section className="rounded-[var(--radius-md)] border border-line p-3 text-[11.5px]">
                        <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Похожие тестовые системы</h3>
                        {run.report.similarSystems.length ? (
                          <ul className="space-y-1">
                            {run.report.similarSystems.slice(0, 8).map((s) => (
                              <li key={`${s.cpu}|${s.gpu}|${s.ram}`}>
                                {s.cpu} + {s.gpu}
                                {s.ram && `, ${s.ram}`} <span className="text-fg-3">· {TIER_LABEL[s.tier].toLowerCase()} · тестов {s.tests}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-fg-3">Подходящих проверенных тестов пока нет — все значения модельные. Добавьте свой замер в FPS Lab.</p>
                        )}
                      </section>
                      <section className="rounded-[var(--radius-md)] border border-line p-3 text-[11.5px]">
                        <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Источники результатов</h3>
                        {run.report.sourcesUsed.length ? (
                          <ul className="space-y-1">
                            {run.report.sourcesUsed.map((s) => (
                              <li key={s.label}>
                                {s.label} <span className="text-fg-3">· тестов {s.tests}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-fg-3">Не использовались.</p>
                        )}
                        <p className="mt-2 text-fg-3">Модель: {run.report.modelVersion}. Внешние сайты не опрашиваются автоматически — их результаты вносятся вручную со ссылкой.</p>
                      </section>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Закрыть
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
