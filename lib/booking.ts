import { db } from '@/lib/db';
import { nextSlots, type BusinessHours, type Slot } from '@/lib/hours';

type Settings = { timezone: string; business_hours: BusinessHours };

async function settings(): Promise<Settings> {
  return (await db().query<Settings>('select timezone, business_hours from harbour.settings where id = 1')).rows[0];
}

// Free consultation times: computed by code from business hours, minus taken ones.
export async function freeSlots(): Promise<Slot[]> {
  const s = await settings();
  const all = nextSlots(new Date(), s.timezone, s.business_hours);
  const taken = await db().query<{ slot_start: string }>(
    `select slot_start from harbour.bookings where status <> 'cancelled' and slot_start >= now()`,
  );
  const busy = new Set(taken.rows.map((r) => new Date(r.slot_start).toISOString()));
  return all.filter((x) => !busy.has(x.start));
}

export type BookResult =
  | { ok: true; ref: string; when: string; where: string; name: string }
  | { ok: false; error: 'taken' | 'not_offered' | 'no_conversation' };

// Reserve a slot. The database guarantees one booking per slot
// (unique index bookings_slot_taken), even under concurrent requests.
export async function book(input: {
  conversationId: string; slot: string; mode: 'online' | 'office'; name: string; email: string;
}): Promise<BookResult> {
  const conv = await db().query('select 1 from harbour.conversations where id = $1', [input.conversationId]);
  if (!conv.rowCount) return { ok: false, error: 'no_conversation' };

  const offered = (await freeSlots()).find((x) => x.start === new Date(input.slot).toISOString());
  if (!offered) return { ok: false, error: 'not_offered' };

  let ref = '';
  for (let i = 0; i < 5 && !ref; i++) {
    const candidate = `HB-${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      await db().query(
        `insert into harbour.bookings (ref, conversation_id, name, email, mode, slot_start) values ($1, $2, $3, $4, $5, $6)`,
        [candidate, input.conversationId, input.name, input.email, input.mode, offered.start],
      );
      ref = candidate;
    } catch (err) {
      const e = err as { code?: string; constraint?: string };
      if (e.code === '23505' && e.constraint === 'bookings_slot_taken') return { ok: false, error: 'taken' };
      if (e.code !== '23505') throw err; // duplicate ref: try another number
    }
  }
  await db().query(
    `update harbour.conversations set visitor_name = $2, visitor_email = $3, last_message_at = now() where id = $1`,
    [input.conversationId, input.name, input.email],
  );
  return {
    ok: true,
    ref,
    when: `${offered.day}, ${offered.label}`,
    where: input.mode === 'online' ? 'online (video call)' : 'at our Sydney office',
    name: input.name,
  };
}
