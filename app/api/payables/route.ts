import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { LIST_COLUMNS, READS_PER_DAY, type PayableRow } from '@/lib/payables';

export const dynamic = 'force-dynamic';

// GET /api/payables : everything on the accounts payable board (no image data).
export async function GET() {
  const rows = (await db().query<PayableRow>(
    `select ${LIST_COLUMNS} from harbour.payables order by created_at desc limit 100`,
  )).rows;
  const used = (await db().query<{ n: number }>(
    `select count(*)::int as n from harbour.document_reads
      where created_at >= (date_trunc('day', now() at time zone 'Australia/Sydney') at time zone 'Australia/Sydney')`,
  )).rows[0].n;
  return NextResponse.json({ payables: rows, reads_left: Math.max(0, READS_PER_DAY - used) });
}
