import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { freeSlots } from '@/lib/booking';
import { askAgent } from '@/lib/agent';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

// GET /api/booking : free times for the booking card
export async function GET() {
  return NextResponse.json({ slots: await freeSlots() });
}

const Post = z.object({
  token: z.string().uuid().optional(),
  slot: z.string().datetime(),
  mode: z.enum(['online', 'office']),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
});

// POST /api/booking : the visitor confirms the form. The reservation itself goes
// through the agent workflow (n8n "Confirm booking" branch -> reserve tool).
export async function POST(req: Request) {
  const parsed = Post.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please choose a time and fill in your name and a valid email.' }, { status: 400 });
  }
  const { token, slot, mode, name, email } = parsed.data;

  let conv = token
    ? (await db().query<{ id: string; visitor_token: string }>('select id, visitor_token from harbour.conversations where visitor_token = $1', [token])).rows[0]
    : undefined;
  if (!conv) {
    conv = (await db().query<{ id: string; visitor_token: string }>('insert into harbour.conversations default values returning id, visitor_token')).rows[0];
  }

  const result = await askAgent({ kind: 'booking_confirm', conversation_id: conv.id, booking: { slot, mode, name, email } });

  if (!result.ok) {
    await db().query('insert into harbour.agent_errors (conversation_id, kind, detail) values ($1, $2, $3)',
      [conv.id, result.kind, result.detail.slice(0, 500)]);
    await db().query(`update harbour.conversations set has_error = true, status = 'needs_human', status_reason = $2 where id = $1`,
      [conv.id, `Booking failed (${result.kind})`]);
    return NextResponse.json({ error: 'Sorry, we could not book right now. A consultant will contact you.', token: conv.visitor_token }, { status: 502 });
  }
  const a = result.answer;
  if (a.route === 'booking_failed') {
    return NextResponse.json({ error: a.reply, token: conv.visitor_token }, { status: 409 });
  }
  await db().query(
    `insert into harbour.messages (conversation_id, role, content, meta) values ($1, 'system', $2, $3)`,
    [conv.id, a.reply, JSON.stringify({ route: a.route, booking: true })],
  );
  return NextResponse.json({ token: conv.visitor_token });
}
