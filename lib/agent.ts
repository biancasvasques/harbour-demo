import { z } from 'zod';

// The agent workflow (n8n) is the orchestrator: it decides the route and only
// calls Claude when a free-text question needs it. Every route answers with
// this one shape. Anything else is treated as a failure.
export const ROUTES = ['silent', 'agent_off', 'ready_answer', 'claude', 'booking_offer', 'booking_done', 'booking_failed', 'goodbye'] as const;

const AgentOk = z.object({
  ok: z.literal(true),
  route: z.enum(ROUTES),
  reply: z.string().nullable().default(null),
  role: z.enum(['agent', 'system']).nullable().default(null),
  fact_codes: z.array(z.string()).default([]),
  knew: z.boolean().default(true),
  needs_human: z.boolean().default(false),
  intent: z.string().default('question'),
  reason: z.string().default(''),
  action: z.enum(['booking', 'survey']).nullable().default(null),
  guardrail: z.string().nullable().default(null),
});
const AgentFail = z.object({
  ok: z.literal(false),
  error: z.enum(['ai_error', 'invalid_output', 'tool_error']),
  detail: z.string(),
});

export type AgentAnswer = z.infer<typeof AgentOk>;
export type AgentResult =
  | { ok: true; answer: AgentAnswer }
  | { ok: false; kind: 'ai_error' | 'invalid_output' | 'tool_error' | 'workflow_unreachable'; detail: string };

export type Fact = { code: string; title: string; content: string };
export type AgentRequest =
  | {
      kind: 'message';
      conversation_id: string;
      message: string;
      status: string;
      agent_enabled: boolean;
      instructions: string;
      facts: Fact[];
      quick: { question: string; code: string }[];
      history: { role: string; content: string }[];
      simulate_failure: boolean;
    }
  | {
      kind: 'booking_confirm';
      conversation_id: string;
      booking: { slot: string; mode: 'online' | 'office'; name: string; email: string };
    };

// Calls the workflow. Never throws: every failure comes back as a value, so the
// caller always has a fallback path. The webhook URL is a secret (env only).
export async function askAgent(req: AgentRequest): Promise<AgentResult> {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return { ok: false, kind: 'workflow_unreachable', detail: 'N8N_WEBHOOK_URL is not set' };

  let raw: unknown;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(35_000),
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
