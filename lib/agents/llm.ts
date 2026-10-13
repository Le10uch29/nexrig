import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AgentResult } from "@/types/agents";

export const AI_MODEL = process.env.BUILDAI_AI_MODEL || "claude-opus-5-5";

/** Live AI is enabled only when credentials are present in the server environment. */
export function isLlmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const SYSTEM_PROMPT = `Ты — координатор BuildAI, помощник по сборке ПК. Отвечай по-русски, кратко и по делу.
Тебе передаются результаты детерминированных агентов (совместимость, бенчмарки, апгрейд, цены) в JSON.
Правила:
- Используй только факты из JSON. Не добавляй цены, FPS, характеристики или источники, которых там нет.
- Проверки совместимости авторитетны: не оспаривай и не смягчай их статусы.
- Значения FPS с пометкой «оценка» называй оценками, а не замерами.
- Если данных для ответа нет, прямо скажи об этом и подскажи, что выбрать в конфигураторе.
- Цены — демонстрационные, не предложения магазинов; упоминай это, когда говоришь о стоимости.
Формат: 1–2 абзаца вывода, затем маркированный список конкретных действий (не более 5).`;

export class LlmUnavailableError extends Error {}

export async function composeWithLlm(question: string, agents: AgentResult[]): Promise<string> {
  const client = new Anthropic();
  const payload = JSON.stringify(
    agents.map(({ agent, summary, findings, dataSources }) => ({ agent, summary, findings, dataSources })),
  );
  try {
    const response = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Результаты агентов:\n${payload}\n\nВопрос пользователя: ${question || "Оцени мою сборку и подскажи, что улучшить."}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      throw new LlmUnavailableError("Модель отклонила запрос.");
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new LlmUnavailableError("Пустой ответ модели.");
    return text;
  } catch (error) {
    if (error instanceof LlmUnavailableError) throw error;
    // Server-side diagnostics only; the message never contains credentials.
    if (error instanceof Anthropic.APIError) console.error(`[buildai] AI provider error ${error.status}: ${error.message}`);
    if (error instanceof Anthropic.AuthenticationError) throw new LlmUnavailableError("Неверные учётные данные AI-провайдера.");
    if (error instanceof Anthropic.RateLimitError) throw new LlmUnavailableError("Превышен лимит запросов AI-провайдера.");
    if (error instanceof Anthropic.APIError) throw new LlmUnavailableError(`Ошибка AI-провайдера (${error.status ?? "сеть"}).`);
    throw new LlmUnavailableError("AI-провайдер недоступен.");
  }
}
