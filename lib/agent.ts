import { z } from 'zod';

// What the n8n workflow answers. Anything else is treated as a failure.
const AgentOk = z.object({
  ok: z.literal(true),
  reply: z.string(),
  knew: z.boolean(),
  fact_codes: z.array(z.string()),
  needs_human: z.boolean(),
  intent: z.enum(['question', 'book_consultation', 'talk_to_person', 'smalltalk']).optional().default('question'),
  reason: z.string().optional().default(''),
  guardrail: z.string().nullable().optional().default(null),
});
const AgentFail = z.object({
  ok: z.literal(false),
  error: z.enum(['ai_error', 'invalid_output']),
  detail: z.string(),
});

export type AgentAnswer = z.infer<typeof AgentOk>;
export type AgentResult =
  | { ok: true; answer: AgentAnswer }
  | { ok: false; kind: 'ai_error' | 'invalid_output' | 'workflow_unreachable'; detail: string };

export type AgentContext = {
  instructions: string;
  message: string;
  facts: { code: string; title: string; content: string }[];
  history: { role: string; content: string }[];
  simulate_failure: boolean;
};

// Calls the agent (n8n). Never throws: every failure comes back as a value, so
// the caller always has a fallback path. The webhook URL is a secret (env only).
export async function askAgent(ctx: AgentContext): Promise<AgentResult> {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return { ok: false, kind: 'workflow_unreachable', detail: 'N8N_WEBHOOK_URL is not set' };

  let raw: unknown;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ctx),
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, kind: 'workflow_unreachable', detail: `workflow answered HTTP ${res.status}` };
    raw = await res.json();
  } catch (err) {
    return { ok: false, kind: 'workflow_unreachable', detail: err instanceof Error ? err.message : String(err) };
  }

  const ok = AgentOk.safeParse(raw);
  if (ok.success) return { ok: true, answer: ok.data };
  const fail = AgentFail.safeParse(raw);
  if (fail.success) return { ok: false, kind: fail.data.error, detail: fail.data.detail };
  return { ok: false, kind: 'invalid_output', detail: 'workflow answer in an unexpected format' };
}
