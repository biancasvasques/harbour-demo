import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Post = z.object({
  token: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

// POST /api/survey : the satisfaction survey shown after a goodbye.
// One rating per conversation; sending again replaces it.
export async function POST(req: Request) {
  const parsed = Post.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Please choose from 1 to 5 stars.' }, { status: 400 });
  const { token, rating, comment } = parsed.data;
  const r = await db().query(
    `update harbour.conversations
        set rating = $2, rating_comment = nullif($3, ''), rated_at = now(), status = 'closed',
            status_reason = coalesce(status_reason, 'Visitor said goodbye')
      where visitor_token = $1`,
    [token, rating, comment ?? ''],
  );
  if (!r.rowCount) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
