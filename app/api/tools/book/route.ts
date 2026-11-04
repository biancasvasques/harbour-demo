import { NextResponse } from 'next/server';
import { z } from 'zod';
import { book } from '@/lib/booking';
import { toolsAuthorized } from '@/lib/tools-auth';

export const dynamic = 'force-dynamic';

const Body = z.object({
  conversation_id: z.string().uuid(),
  slot: z.string().datetime(),
  mode: z.enum(['online', 'office']),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
});

// Tool for the agent workflow: reserve a slot (one person per slot, enforced by the database).
export async function POST(req: Request) {
  if (!toolsAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });
  const b = parsed.data;
  const result = await book({ conversationId: b.conversation_id, slot: b.slot, mode: b.mode, name: b.name, email: b.email });
  return NextResponse.json(result);
}
