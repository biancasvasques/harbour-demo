import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import type { Extracted } from '@/lib/payable-checks';
import { LIST_COLUMNS, READS_PER_DAY, SAMPLES, checksFor, columnsFrom, type PayableRow, type SampleKey } from '@/lib/payables';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.union([
  z.object({ sample: z.enum(Object.keys(SAMPLES) as [SampleKey, ...SampleKey[]]) }),
  // the browser downscales uploads to a JPEG of about 1600px before sending
  z.object({ image: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/).max(2_000_000) }),
]);

type ReaderReply = { ok: true; extracted: Extracted } | { ok: false; error: string; detail: string };

// POST /api/payables/read : one invoice image in, a payable waiting for review out.
// The AI reads it (n8n workflow), the code checks it, a person decides later.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Send one of the sample invoices, or a JPEG or PNG under 1.5 MB.' }, { status: 400 });

  const url = process.env.N8N_DOCS_WEBHOOK_URL;
  if (!url) return NextResponse.json({ error: 'The invoice reader is not connected yet.' }, { status: 503 });

  // daily cost cap, Sydney day
  const used = (await db().query<{ n: number }>(
    `select count(*)::int as n from harbour.document_reads
      where created_at >= (date_trunc('day', now() at time zone 'Australia/Sydney') at time zone 'Australia/Sydney')`,
  )).rows[0].n;
  if (used >= READS_PER_DAY) {
    return NextResponse.json({ error: `This demo reads at most ${READS_PER_DAY} invoices a day. Please try again tomorrow.` }, { status: 429 });
  }

  // the image: a sample from this site, or the upload
  let mediaType = 'image/jpeg';
  let data: string;
  const body = parsed.data;
  if ('sample' in body) {
    const res = await fetch(new URL(SAMPLES[body.sample].file, req.url), { cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ error: 'Sample invoice not found.' }, { status: 500 });
    data = Buffer.from(await res.arrayBuffer()).toString('base64');
  } else {
    const m = body.image.match(/^data:(image\/[a-z]+);base64,(.*)$/);
    mediaType = m![1];
    data = m![2];
  }

  const simulate = (await db().query<{ simulate_ai_failure: boolean }>('select simulate_ai_failure from harbour.settings where id = 1')).rows[0].simulate_ai_failure;
  await db().query('insert into harbour.document_reads default values');

  let reply: ReaderReply;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: { media_type: mediaType, data }, simulate_failure: simulate }),
      signal: AbortSignal.timeout(55_000),
      cache: 'no-store',
    });
    reply = res.ok ? ((await res.json()) as ReaderReply) : { ok: false, error: 'workflow_unreachable', detail: `workflow answered HTTP ${res.status}` };
  } catch (err) {
    reply = { ok: false, error: 'workflow_unreachable', detail: err instanceof Error ? err.message : String(err) };
  }

  if (!reply.ok || !reply.extracted) {
    const kind = reply.ok ? 'invalid_output' : (['ai_error', 'invalid_output', 'tool_error'].includes(reply.error) ? reply.error : 'workflow_unreachable');
    const detail = reply.ok ? 'empty extraction' : reply.detail;
    // same alert banner as the chat: the team sees it in the panel
    await db().query('insert into harbour.agent_errors (kind, detail) values ($1, $2)', [kind, `Invoice reader: ${detail}`.slice(0, 500)]);
    return NextResponse.json({ error: 'The AI could not read this invoice right now. Nothing was saved, and the team has been alerted.' }, { status: 502 });
  }

  const e = reply.extracted;
  const checks = await checksFor(e);
  const c = columnsFrom(e);
  const row = (await db().query<PayableRow>(
    `insert into harbour.payables (source, sample_key, image_data, extracted, checks, supplier, abn, invoice_number,
                                   invoice_date, due_date, subtotal_cents, gst_cents, total_cents)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning ${LIST_COLUMNS}`,
    ['sample' in body ? 'sample' : 'upload', 'sample' in body ? body.sample : null, 'image' in body ? body.image : null,
      JSON.stringify(e), JSON.stringify(checks), c.supplier, c.abn, c.invoice_number, c.invoice_date, c.due_date,
      c.subtotal_cents, c.gst_cents, c.total_cents],
  )).rows[0];
  return NextResponse.json({ payable: row });
}
