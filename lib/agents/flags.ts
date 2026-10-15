/** The AI expert (UI and /api/agents) is off unless NEXRIG_ENABLE_AI_EXPERT=1 is set on the server. */
export const aiExpertEnabled = (env: Record<string, string | undefined> = process.env) => env.NEXRIG_ENABLE_AI_EXPERT === "1";
