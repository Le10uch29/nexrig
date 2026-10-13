export type AgentId = "compatibility" | "benchmark" | "upgrade" | "price" | "coordinator";

/** A tool the agent actually executed (all are local deterministic functions in this build). */
export interface AgentToolCall {
  tool: string;
  input: string;
  outputSummary: string;
}

export interface AgentFinding {
  severity: "info" | "positive" | "warning" | "critical";
  text: string;
}

export interface AgentResult {
  agent: AgentId;
  title: string;
  summary: string;
  findings: AgentFinding[];
  toolCalls: AgentToolCall[];
  dataSources: string[];
}

export interface CoordinatorResponse {
  mode: "deterministic" | "llm";
  /** Explains why live AI is unavailable when mode is deterministic. */
  notice?: string;
  answer: string;
  agents: AgentResult[];
  model?: string;
  generatedAt: string;
}
