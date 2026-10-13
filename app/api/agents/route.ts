import { z } from "zod";
import { composeDeterministic, runSpecialists } from "@/lib/agents/coordinator";
import { AI_MODEL, composeWithLlm, isLlmConfigured, LlmUnavailableError } from "@/lib/agents/llm";
import { agentRequestSchema, benchmarkInputSchema } from "@/lib/validation/schemas";
import type { CoordinatorResponse } from "@/types/agents";
import type { BenchmarkRecord } from "@/types/benchmark";

const bodySchema = agentRequestSchema.extend({
  measured: z.array(benchmarkInputSchema.extend({ id: z.string() })).max(200).optional(),
});

export async function GET() {
  return Response.json({ llmConfigured: isLlmConfigured(), model: isLlmConfigured() ? AI_MODEL : null });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Некорректный JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Неверный формат запроса." }, { status: 400 });

  const measured: BenchmarkRecord[] = (parsed.data.measured ?? []).map((m) => ({
    id: m.id,
    gameId: m.gameId,
    cpuId: m.cpuId,
    gpuId: m.gpuId,
    settings: m.settings,
    avgFps: m.avgFps,
    low1Fps: m.low1Fps,
    source: { kind: "user", label: m.sourceLabel, url: m.sourceUrl || undefined },
    testDate: m.testDate,
    conditions: m.conditions,
    sampleCount: m.sampleCount,
  }));

  const agents = runSpecialists(parsed.data, measured);
  const base = { agents, generatedAt: new Date().toISOString() };

  if (!isLlmConfigured()) {
    const res: CoordinatorResponse = {
      ...base,
      mode: "deterministic",
      notice: "Live AI-анализ недоступен: на сервере не задан ANTHROPIC_API_KEY. Ответ собран детерминированным координатором из результатов агентов.",
      answer: composeDeterministic(parsed.data.question, agents),
    };
    return Response.json(res);
  }

  try {
    const answer = await composeWithLlm(parsed.data.question, agents);
    const res: CoordinatorResponse = { ...base, mode: "llm", answer, model: AI_MODEL };
    return Response.json(res);
  } catch (error) {
    const reason = error instanceof LlmUnavailableError ? error.message : "AI-провайдер недоступен.";
    const res: CoordinatorResponse = {
      ...base,
      mode: "deterministic",
      notice: `${reason} Показан детерминированный ответ координатора.`,
      answer: composeDeterministic(parsed.data.question, agents),
    };
    return Response.json(res);
  }
}
