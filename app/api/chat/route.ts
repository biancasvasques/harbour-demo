import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { askAgent } from '@/lib/agent';
import { QUICK_QUESTIONS } from '@/lib/quick';
import { isOpen, type BusinessHours } from '@/lib/hours';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

// Cost guard for a public demo.
const PER_CONVERSATION = 20;
const PER_DAY = 50;

const Post = z.object({
  token: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(1000),
});

type Settings = {
  agent_enabled: boolean;
  instructions: string;
  timezone: string;
  business_hours: BusinessHours;
  after_hours_notice: string;
  fallback_message: string;
  handoff_message: string;
  simulate_ai_failure: boolean;
};
type Conv = { id: string; visitor_token: string; status: string; visitor_messages: number };
type PublicMessage = { role: string; content: string; created_at: string; action: string | null; author: string | null };

const publicMessages = (convId: string, since?: string) =>
  db().query<PublicMessage>(
    `select role, content, created_at, meta->>'action' as action, meta->>'author' as author from harbour.messages
      where conversation_id = $1 and ($2::timestamptz is null or created_at > $2::timestamptz)
      order by created_at, id`,
    [convId, since ?? null],
  );

// GET /api/chat?token=... : the visitor's own conversation (polled to see staff replies).
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!z.string().uuid().safeParse(token).success) return NextResponse.json({ messages: [] });
  const c = await db().query<Conv & { visitor_name: string | null; rating: number | null; rated_at: string | null }>(
    'select id, status, visitor_name, rating, rated_at from harbour.conversations where visitor_token = $1', [token]);
  if (!c.rows[0]) return NextResponse.json({ messages: [] });
  const m = await publicMessages(c.rows[0].id);
  return NextResponse.json({ status: c.rows[0].status, visitor_name: c.rows[0].visitor_name, rating: c.rows[0].rating, rated_at: c.rows[0].rated_at, messages: m.rows });
}

// POST /api/chat : a visitor message in, the replies out.
export async function POST(req: Request) {
  const parsed = Post.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Please type a message (up to 1000 characters).' }, { status: 400 });
  const { token, message } = parsed.data;

  const s = (await db().query<Settings>('select * from harbour.settings where id = 1')).rows[0];

  // daily cap, counted in the business time zone
  const today = await db().query<{ n: number }>(
    `select count(*)::int as n from harbour.messages
      where role = 'visitor' and created_at >= (date_trunc('day', now() at time zone $1) at time zone $1)`,
    [s.timezone],
  );
  if (today.rows[0].n >= PER_DAY) {
    return NextResponse.json({ error: 'This demo has reached its message limit for today. Please try again tomorrow.' }, { status: 429 });
  }

  // find or start the conversation
  let conv: Conv | undefined;
  if (token) {
    conv = (await db().query<Conv>('select id, visitor_token, status, visitor_messages from harbour.conversations where visitor_token = $1', [token])).rows[0];
  }
  if (!conv) {
    conv = (await db().query<Conv>('insert into harbour.conversations default values returning id, visitor_token, status, visitor_messages')).rows[0];
  }
  if (conv.visitor_messages >= PER_CONVERSATION) {
    return NextResponse.json(
      { error: `This demo conversation is limited to ${PER_CONVERSATION} messages. Start a new chat to keep testing.`, token: conv.visitor_token },
      { status: 429 },
    );
  }

  // history BEFORE this message, for the agent
  // System notes that change the situation (a booking confirmation) go into the
  // history too, written as the assistant's own turn, so the agent knows the
  // visitor already booked. Other notices (after hours, fallback) stay out.
  const history = (await db().query<{ role: string; content: string }>(
    `select case when role = 'system' then 'agent' else role end as role, content from (
       select role, content, created_at, id from harbour.messages
        where conversation_id = $1 and (role <> 'system' or meta ? 'booking')
        order by created_at desc, id desc limit 10) h
     order by created_at, id`,
    [conv.id],
  )).rows;

  const saved = await db().query<{ created_at: string }>(
    `insert into harbour.messages (conversation_id, role, content) values ($1, 'visitor', $2) returning created_at`,
    [conv.id, message],
  );
  const since = new Date(new Date(saved.rows[0].created_at).getTime() - 1).toISOString();
  const reopened = conv.status === 'closed' ? 'bot' : conv.status;
  await db().query(
    `update harbour.conversations set visitor_messages = visitor_messages + 1, last_message_at = now(), status = $2 where id = $1`,
    [conv.id, reopened],
  );

  const say = (role: 'agent' | 'system', content: string, extra: { fact_codes?: string[]; meta?: object } = {}) =>
    db().query(
      `insert into harbour.messages (conversation_id, role, content, fact_codes, meta) values ($1, $2, $3, $4, $5)`,
      [conv.id, role, content, extra.fact_codes ?? [], JSON.stringify(extra.meta ?? {})],
    );
  const setStatus = (status: string, reason: string | null, hasError = false) =>
    db().query(
      `update harbour.conversations set status = $2, status_reason = $3, has_error = has_error or $4 where id = $1`,
      [conv.id, status, reason, hasError],
    );

  const open = isOpen(new Date(), s.timezone, s.business_hours);
  const facts = (await db().query<{ code: string; title: string; content: string }>(
    'select code, title, content from harbour.facts where approved order by code',
  )).rows;

  // The workflow decides the route (silent, agent off, ready answer without AI,
  // Claude, booking). The app only saves what comes back.
  const result = await askAgent({
    kind: 'message',
    conversation_id: conv.id,
    message,
    status: reopened,
    agent_enabled: s.agent_enabled,
    instructions: s.instructions,
    facts,
    quick: QUICK_QUESTIONS,
    history,
    simulate_failure: s.simulate_ai_failure,
  });

  let replied = false;
  if (result.ok) {
    const a = result.answer;
    // a reply blocked by the checks comes back empty: use the hand-over text from settings
    const text = a.reply?.trim() || (a.route === 'claude' ? s.handoff_message : '');
    if (text && a.role) {
      await say(a.role, text, {
        fact_codes: a.fact_codes,
        meta: {
          route: a.route, knew: a.knew, needs_human: a.needs_human, intent: a.intent,
          guardrail: a.guardrail, reason: a.reason, ...(a.action ? { action: a.action } : {}),
        },
      });
      replied = true;
    }
    if (a.route === 'agent_off') await setStatus('needs_human', 'Agent switched off');
    else if (a.route === 'goodbye') await setStatus('closed', 'Visitor said goodbye');
    else if (a.needs_human) await setStatus('needs_human', a.reason || 'Agent did not know');
  } else {
    // the AI or a tool failed: the visitor still gets an answer, the team gets an alert
    await db().query(
      'insert into harbour.agent_errors (conversation_id, kind, detail) values ($1, $2, $3)',
      [conv.id, result.kind, result.detail.slice(0, 500)],
    );
    await setStatus('needs_human', `AI failure (${result.kind})`, true);
    await say('system', s.fallback_message, { meta: { fallback: true, error: result.kind } });
    replied = true;
  }

  // after-hours notice, added by code, at most once every 12 hours per conversation
  if (replied && !open) {
    const already = await db().query(
      `select 1 from harbour.messages where conversation_id = $1 and meta->>'after_hours' = 'true'
         and created_at > now() - interval '12 hours' limit 1`,
      [conv.id],
    );
    if (!already.rowCount) await say('system', s.after_hours_notice, { meta: { after_hours: true } });
  }

  const status = (await db().query<{ status: string }>('select status from harbour.conversations where id = $1', [conv.id])).rows[0].status;
  const fresh = await publicMessages(conv.id, since);
  return NextResponse.json({ token: conv.visitor_token, status, messages: fresh.rows });
}
