import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { nextSlots, type BusinessHours } from '@/lib/hours';

export const dynamic = 'force-dynamic';

type Settings = { timezone: string; business_hours: BusinessHours };

async function settings() {
  return (await db().query<Settings>('select timezone, business_hours from harbour.settings where id = 1')).rows[0];
}

async function freeSlots(s: Settings) {
  const all = nextSlots(new Date(), s.timezone, s.business_hours);
  const taken = await db().query<{ slot_start: string }>(
    `select slot_start from harbour.bookings where status <> 'cancelled' and slot_start >= now()`,
  );
  const busy = new Set(taken.rows.map((r) => new Date(r.slot_start).toISOString()));
  return all.filter((x) => !busy.has(x.start));
}

// GET /api/booking : free consultation times (computed by code, never by the model)
export async function GET() {
  const s = await settings();
  return NextResponse.json({ timezone: s.timezone, slots: await freeSlots(s) });
}

const Post = z.object({
  token: z.string().uuid().optional(),
  slot: z.string().datetime(),
  mode: z.enum(['online', 'office']),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
});

// POST /api/booking : reserve a slot for this conversation
export async function POST(req: Request) {
  const parsed = Post.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please choose a time and fill in your name and a valid email.' }, { status: 400 });
  }
  const { token, slot, mode, name, email } = parsed.data;
  const s = await settings();

  // the slot must be one we actually offer, and still free
  const offered = (await freeSlots(s)).find((x) => x.start === new Date(slot).toISOString());
  if (!offered) {
    return NextResponse.json({ error: 'Sorry, that time is no longer available. Please pick another one.' }, { status: 409 });
  }

  let conv = token
    ? (await db().query<{ id: string; visitor_token: string }>('select id, visitor_token from harbour.conversations where visitor_token = $1', [token])).rows[0]
    : undefined;
  if (!conv) {
    conv = (await db().query<{ id: string; visitor_token: string }>('insert into harbour.conversations default values returning id, visitor_token')).rows[0];
  }

  let ref = '';
  for (let i = 0; i < 5 && !ref; i++) {
    const candidate = `HB-${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      await db().query(
        `insert into harbour.bookings (ref, conversation_id, name, email, mode, slot_start) values ($1, $2, $3, $4, $5, $6)`,
        [candidate, conv.id, name, email, mode, offered.start],
      );
      ref = candidate;
    } catch (err) {
      const code = (err as { code?: string; constraint?: string }).code;
      const constraint = (err as { constraint?: string }).constraint;
      if (code === '23505' && constraint === 'bookings_slot_taken') {
        return NextResponse.json({ error: 'Sorry, someone just took that time. Please pick another one.' }, { status: 409 });
      }
      if (code !== '23505') throw err; // a duplicate ref just tries another number
    }
  }

  const when = `${offered.day}, ${offered.label}`;
  const where = mode === 'online' ? 'online (video call)' : 'at our Sydney office';
  const text =
    `✅ Consultation requested for ${when} (Sydney time), ${where}. Reference ${ref}. ` +
    `A consultant will confirm by email. (This is a demo: no email is sent.)`;

  await db().query(
    `insert into harbour.messages (conversation_id, role, content, meta) values ($1, 'system', $2, $3)`,
    [conv.id, text, JSON.stringify({ booking: ref })],
  );
  await db().query(
    `update harbour.conversations set visitor_name = $2, visitor_email = $3, last_message_at = now() where id = $1`,
    [conv.id, name, email],
  );

  return NextResponse.json({ token: conv.visitor_token, ref, when, where });
}
