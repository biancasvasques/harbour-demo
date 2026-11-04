// Checks that run in code on every invoice the AI reads, before a person
// decides. The model only extracts; these rules decide what needs attention.
// Pure functions, no database: tests/payable-checks.test.ts runs them directly.

export type LineItem = { description: string | null; quantity: number | null; amount: number | null };

export type Extracted = {
  document_type: 'invoice' | 'receipt' | 'other' | null;
  supplier_name: string | null;
  abn: string | null;
  invoice_number: string | null;
  invoice_date: string | null; // YYYY-MM-DD
  due_date: string | null;
  currency: string | null;
  line_items: LineItem[];
  subtotal: number | null;
  gst: number | null;
  total: number | null;
  unclear: string | null;
};

export type Check = { level: 'error' | 'warning' | 'ok'; code: string; message: string };

export type Existing = { id: string; supplier: string | null; abn: string | null; invoice_number: string | null; status: string };

const GST_RATE = 0.1; // Australian GST
const TOLERANCE_CENTS = 2; // rounding on the supplier's side

export const toCents = (n: number | null | undefined): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) : null;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ABN: 11 digits, weighted checksum (subtract 1 from the first digit, sum mod 89 = 0).
export function abnIsValid(abn: string | null | undefined): boolean {
  const d = (abn ?? '').replace(/\s/g, '');
  if (!/^\d{11}$/.test(d)) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = d.split('').map(Number);
  digits[0] -= 1;
  return digits.reduce((s, x, i) => s + x * w[i], 0) % 89 === 0;
}

const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export function runChecks(e: Extracted, existing: Existing[], selfId?: string): Check[] {
  const out: Check[] = [];
  const add = (level: Check['level'], code: string, message: string) => out.push({ level, code, message });

  if (e.document_type && e.document_type !== 'invoice') {
    add('warning', 'not_invoice', `This looks like a ${e.document_type}, not a tax invoice. Check before paying.`);
  }

  // required fields: never guessed by the model, so missing means a person looks
  const missing = [
    ['supplier name', e.supplier_name], ['invoice number', e.invoice_number],
    ['invoice date', e.invoice_date], ['total', e.total],
  ].filter(([, v]) => v === null || v === '').map(([k]) => k);
  if (missing.length) add('error', 'missing', `Could not read: ${missing.join(', ')}.`);

  // ABN
  if (!e.abn) add('warning', 'abn_missing', 'No ABN on the invoice. Without it, 47% must be withheld unless the supplier is exempt.');
  else if (!abnIsValid(e.abn)) add('error', 'abn_invalid', `ABN ${e.abn} fails the official checksum.`);
  else add('ok', 'abn_valid', 'ABN passes the checksum.');

  // lines add up
  const sub = toCents(e.subtotal);
  const gst = toCents(e.gst);
  const total = toCents(e.total);
  const lineCents = e.line_items.map((l) => toCents(l.amount));
  if (lineCents.length && lineCents.every((c) => c !== null)) {
    const sum = (lineCents as number[]).reduce((a, b) => a + b, 0);
    const target = sub ?? (total !== null && gst !== null ? total - gst : null);
    if (target !== null) {
      if (Math.abs(sum - target) > TOLERANCE_CENTS) add('error', 'lines_mismatch', `Line items add up to ${money(sum)}, but the subtotal is ${money(target)}.`);
      else add('ok', 'lines_match', 'Line items add up to the subtotal.');
    }
  }

  // GST is 10% and the total adds up
  if (sub !== null && gst !== null) {
    const expected = Math.round(sub * GST_RATE);
    if (Math.abs(gst - expected) > TOLERANCE_CENTS) add('error', 'gst_wrong', `GST is ${money(gst)}, but 10% of ${money(sub)} is ${money(expected)}.`);
    else add('ok', 'gst_ok', 'GST is 10% of the subtotal.');
  }
  if (sub !== null && gst !== null && total !== null) {
    if (Math.abs(sub + gst - total) > TOLERANCE_CENTS) add('error', 'total_mismatch', `Subtotal plus GST is ${money(sub + gst)}, but the total says ${money(total)}.`);
  }

  // dates
  if (e.invoice_date && !isDate(e.invoice_date)) add('warning', 'bad_date', 'The invoice date is not a valid date.');
  if (isDate(e.invoice_date) && isDate(e.due_date) && Date.parse(e.due_date as string) < Date.parse(e.invoice_date as string)) {
    add('warning', 'due_before_date', 'The due date is before the invoice date.');
  }
  if (!e.due_date) add('warning', 'no_due_date', 'No due date found. Payment terms need confirming.');

  // duplicates: same supplier (ABN or name) and same invoice number, not rejected
  if (e.invoice_number) {
    const dup = existing.find((x) => x.id !== selfId && x.status !== 'rejected'
      && norm(x.invoice_number) === norm(e.invoice_number)
      && ((e.abn && norm(x.abn) === norm(e.abn)) || norm(x.supplier) === norm(e.supplier_name)));
    if (dup) add('error', 'duplicate', `Invoice ${e.invoice_number} from this supplier is already ${dup.status === 'approved' ? 'approved' : 'waiting for review'}. Paying it again would be a double payment.`);
  }

  if (e.unclear) add('warning', 'unclear', `The AI flagged: ${e.unclear}`);
  return out;
}

export const hasErrors = (checks: Check[]) => checks.some((c) => c.level === 'error');
