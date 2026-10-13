import { GAMES } from "@/data/games";
import { resolveBuild } from "@/lib/hardware/repository";
import type { AgentRequest } from "@/lib/validation/schemas";
import type { AgentResult } from "@/types/agents";
import type { BenchmarkRecord, GameSettings } from "@/types/benchmark";
import { benchmarkAgent, compatibilityAgent, priceAgent, upgradeAgent } from "./specialists";

const DEFAULT_SETTINGS: GameSettings = { resolution: "1440p", preset: "high", rayTracing: false, upscaling: "off" };

/** Runs every specialist. Pure and deterministic: identical input → identical output. */
export function runSpecialists(req: AgentRequest, measured: BenchmarkRecord[] = []): AgentResult[] {
  const build = resolveBuild(req.selection);
  const game = GAMES.find((g) => g.id === req.gameId) ?? GAMES[0];
  const settings = req.settings ?? DEFAULT_SETTINGS;
  return [
    compatibilityAgent(req.selection),
    benchmarkAgent(build, game, settings, measured),
    upgradeAgent(req.selection, game, settings, req.budgetRub),
    priceAgent(build),
  ];
}

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

/**
 * Build Coordinator fallback: orders specialist results by what the question asks about and
 * stitches their summaries. No free-form generation, so nothing beyond agent output is stated.
 */
export function composeDeterministic(question: string, agents: AgentResult[]): string {
  const q = question.toLowerCase();
  const byId = Object.fromEntries(agents.map((a) => [a.agent, a])) as Record<string, AgentResult>;
  let order = ["compatibility", "benchmark", "upgrade", "price"];
  if (has(q, "fps", "фпс", "игр", "кадр", "бенч", "производит")) order = ["benchmark", "upgrade", "compatibility", "price"];
  else if (has(q, "апгрейд", "улучш", "замен", "обнов", "upgrade")) order = ["upgrade", "benchmark", "price", "compatibility"];
  else if (has(q, "цен", "стоим", "бюджет", "дешев", "дорог", "₽", "руб")) order = ["price", "upgrade", "compatibility", "benchmark"];
  else if (has(q, "совмест", "подойд", "влез", "сокет", "блок питания", "бп")) order = ["compatibility", "price", "benchmark", "upgrade"];

  const lines: string[] = [];
  for (const id of order) {
    const a = byId[id];
    if (!a) continue;
    lines.push(`**${a.title}.** ${a.summary}`);
    const important = a.findings.filter((f) => f.severity !== "info").slice(0, 3);
    for (const f of important.length ? important : a.findings.slice(0, 2)) lines.push(`• ${f.text}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}
