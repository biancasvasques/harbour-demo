import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hasErrors, type Extracted } from '@/lib/payable-checks';
import { Correction, LIST_COLUMNS, checksFor, columnsFrom, type PayableRow } from '@/lib/payables';

export const dynamic = 'force-dynamic';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('correct'), fields: Correction }),
  z.object({ action: z.literal('approve'), note: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal('reject'), note: z.string().trim().max(300).optional() }),
]);

// POST /api/payables/:id : a person corrects, approves or rejects.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const b = parsed.data;

  const row = (await db().query<PayableRow>(`select ${LIST_COLUMNS} from harbour.payables where id = $1`, [id])).rows[0];
  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (row.status !== 'review') return NextResponse.json({ error: `This invoice was already ${row.status}.` }, { status: 409 });

  if (b.action === 'correct') {
    // the correction replaces what the AI read, and every check runs again
    const e: Extracted = { ...row.extracted, ...b.fields };
    const checks = await checksFor(e, id);
    const c = columnsFrom(e);
    const updated = (await db().query<PayableRow>(
      `update harbour.payables set extracted = $2, checks = $3, edited = true, supplier = $4, abn = $5, invoice_number = $6,
              invoice_date = $7, due_date = $8, subtotal_cents = $9, gst_cents = $10, total_cents = $11
        where id = $1 returning ${LIST_COLUMNS}`,
      [id, JSON.stringify(e), JSON.stringify(checks), c.supplier, c.abn, c.invoice_number, c.invoice_date, c.due_date,
        c.subtotal_cents, c.gst_cents, c.total_cents],
    )).rows[0];
    return NextResponse.json({ payable: updated });
  }

  if (b.action === 'approve') {
    // checks are re-run at the moment of approval: something may have changed since the read
    const checks = await checksFor(row.extracted, id);
    if (hasErrors(checks) && !b.note) {
      return NextResponse.json({ error: 'This invoice has problems. Correct them, or write why you are approving it anyway.', checks }, { status: 422 });
    }
    if (row.total_cents === null) return NextResponse.json({ error: 'An invoice without a total cannot become a cost. Correct the total first.' }, { status: 422 });
    const updated = (await db().query<PayableRow>(
      `update harbour.payables set status = 'approved', checks = $2, decision_note = $3, decided_at = now()
        where id = $1 returning ${LIST_COLUMNS}`,
      [id, JSON.stringify(checks), b.note ?? null],
    )).rows[0];
    return NextResponse.json({ payable: updated });
  }

  const updated = (await db().query<PayableRow>(
    `update harbour.payables set status = 'rejected', decision_note = $2, decided_at = now() where id = $1 returning ${LIST_COLUMNS}`,
    [id, b.note ?? null],
  )).rows[0];
  return NextResponse.json({ payable: updated });
}
