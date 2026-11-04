import { z } from 'zod';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/payables/:id/image : the uploaded image or PDF (samples are static files).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new Response('Not found', { status: 404 });
  const row = (await db().query<{ image_data: string | null }>('select image_data from harbour.payables where id = $1', [id])).rows[0];
  const m = row?.image_data?.match(/^data:(image\/[a-z]+|application\/pdf);base64,(.*)$/);
  if (!m) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(m[2], 'base64'), { headers: { 'content-type': m[1], 'cache-control': 'private, max-age=3600' } });
}
