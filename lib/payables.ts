import { z } from 'zod';
import { db } from './db';
import { runChecks, toCents, type Check, type Existing, type Extracted } from './payable-checks';

export const SAMPLES = {
  'bondi-homestay': { file: '/samples/bondi-homestay.jpg', label: 'Bondi Homestay Network', hint: 'A clean invoice' },
  'airport-transfers': { file: '/samples/airport-transfers.jpg', label: 'Harbourside Airport Transfers', hint: 'Check the GST' },
  officehub: { file: '/samples/officehub.jpg', label: 'OfficeHub Supplies', hint: 'Seen this one before?' },
} as const;
export type SampleKey = keyof typeof SAMPLES;

export const READS_PER_DAY = 25;

export type PayableRow = {
  id: string; source: string; sample_key: string | null; status: string; extracted: Extracted; checks: Check[];
  supplier: string | null; abn: string | null; invoice_number: string | null; invoice_date: string | null; due_date: string | null;
  subtotal_cents: number | null; gst_cents: number | null; total_cents: number | null; edited: boolean;
  decision_note: string | null; decided_at: string | null; created_at: string;
};

// The columns the panel sorts and sums on are derived from what the AI read
// (or what a person corrected), never typed twice.
export function columnsFrom(e: Extracted) {
  const date = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null);
  return {
    supplier: e.supplier_name,
    abn: e.abn ? e.abn.replace(/\s/g, '') : null,
    invoice_number: e.invoice_number,
    invoice_date: date(e.invoice_date),
    due_date: date(e.due_date),
    subtotal_cents: toCents(e.subtotal),
    gst_cents: toCents(e.gst),
    total_cents: toCents(e.total),
  };
}

export async function existingPayables(): Promise<Existing[]> {
  return (await db().query<Existing>(
    `select id, supplier, abn, invoice_number, status from harbour.payables where status <> 'rejected'`,
  )).rows;
}

export async function checksFor(e: Extracted, selfId?: string): Promise<Check[]> {
  return runChecks(e, await existingPayables(), selfId);
}

export const LIST_COLUMNS = `id, source, sample_key, status, extracted, checks, supplier, abn, invoice_number,
  to_char(invoice_date, 'YYYY-MM-DD') as invoice_date, to_char(due_date, 'YYYY-MM-DD') as due_date,
  subtotal_cents, gst_cents, total_cents, edited, decision_note, decided_at, created_at`;

// Fields a person may correct before approving.
export const Correction = z.object({
  supplier_name: z.string().trim().max(160).nullable(),
  abn: z.string().trim().max(20).nullable(),
  invoice_number: z.string().trim().max(60).nullable(),
  invoice_date: z.string().trim().max(10).nullable(),
  due_date: z.string().trim().max(10).nullable(),
  subtotal: z.number().finite().nullable(),
  gst: z.number().finite().nullable(),
  total: z.number().finite().nullable(),
}).partial();
