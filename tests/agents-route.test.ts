import { afterEach, describe, expect, it } from "vitest";

const post = (body: string, headers: Record<string, string> = { origin: "http://x", host: "x" }) => new Request("http://x/api/agents", { method: "POST", headers, body });
const valid = JSON.stringify({ question: "Какая видеокарта лучше?", selection: {} });

describe("/api/agents (fix 8)", () => {
  afterEach(() => {
    delete process.env.NEXRIG_ENABLE_AI_EXPERT;
  });

  it("is switched off by default", async () => {
    const { GET, POST } = await import("@/app/api/agents/route");
    expect((await GET()).status).toBe(404);
    expect((await POST(post(valid))).status).toBe(404);
  });

  it("when enabled: same origin only, bounded body, rate limited", async () => {
    process.env.NEXRIG_ENABLE_AI_EXPERT = "1";
    const { POST } = await import("@/app/api/agents/route");
    expect((await POST(post(valid, { origin: "https://evil.example", host: "x" }))).status).toBe(403);
    expect((await POST(post("x".repeat(70_000)))).status).toBe(413);
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await POST(post("{", { origin: "http://x", host: "x", "x-forwarded-for": "198.51.100.7" }))).status);
    expect(statuses).toContain(429);
  });
});
