'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';

type Check = { level: 'error' | 'warning' | 'ok'; code: string; message: string };
type Line = { description: string | null; quantity: number | null; amount: number | null };
type Extracted = {
  document_type: string | null; supplier_name: string | null; abn: string | null; invoice_number: string | null;
  invoice_date: string | null; due_date: string | null; currency: string | null; line_items: Line[];
  subtotal: number | null; gst: number | null; total: number | null; unclear: string | null;
};
type Payable = {
  id: string; source: string; sample_key: string | null; status: 'review' | 'approved' | 'rejected';
  extracted: Extracted; checks: Check[]; supplier: string | null; invoice_number: string | null;
  invoice_date: string | null; due_date: string | null; subtotal_cents: number | null; gst_cents: number | null;
  total_cents: number | null; edited: boolean; decision_note: string | null; decided_at: string | null; created_at: string;
};

const SAMPLES = [
  { key: 'bondi-homestay', file: '/samples/bondi-homestay.jpg', label: 'Bondi Homestay Network', hint: 'A clean invoice' },
  { key: 'airport-transfers', file: '/samples/airport-transfers.jpg', label: 'Harbourside Airport Transfers', hint: 'Check the GST' },
  { key: 'officehub', file: '/samples/officehub.jpg', label: 'OfficeHub Supplies', hint: 'Seen this one before?' },
];

const aud = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? '–' : (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const day = (iso: string | null) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
const daysUntil = (iso: string | null) => (iso ? Math.round((Date.parse(iso + 'T00:00:00') - Date.now()) / 86_400_000) : null);
const imageOf = (p: Payable) => (p.sample_key ? SAMPLES.find((s) => s.key === p.sample_key)?.file : `/api/payables/${p.id}/image`);

// Downscale in the browser: smaller upload, cheaper AI read, nothing kept at full size.
async function downscale(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

const STEPS = ['AI reads the document', 'Code checks the numbers', 'A person decides'];

function Steps({ active }: { active: number }) {
  return (
    <ol className="ap-steps" aria-label="How it works">
      {STEPS.map((s, i) => (
        <li key={s} className={i < active ? 'done' : i === active ? 'on' : ''}><i>{i + 1}</i>{s}</li>
      ))}
    </ol>
  );
}

function CheckList({ checks }: { checks: Check[] }) {
  const order = { error: 0, warning: 1, ok: 2 };
  const sorted = [...checks].sort((a, b) => order[a.level] - order[b.level]);
  return (
    <ul className="ap-checks">
      {sorted.map((c) => (
        <li key={c.code} className={c.level}>
          <b aria-hidden>{c.level === 'ok' ? '✓' : c.level === 'error' ? '!' : '?'}</b>
          <span>{c.message}</span>
        </li>
      ))}
    </ul>
  );
}

function Review({ p, onChange }: { p: Payable; onChange: (p: Payable) => void }) {
  const e = p.extracted;
  const [f, setF] = useState({
    supplier_name: e.supplier_name ?? '', abn: e.abn ?? '', invoice_number: e.invoice_number ?? '',
    invoice_date: e.invoice_date ?? '', due_date: e.due_date ?? '',
    subtotal: e.subtotal?.toString() ?? '', gst: e.gst?.toString() ?? '', total: e.total?.toString() ?? '',
  });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errors = p.checks.filter((c) => c.level === 'error').length;
  const dirty = JSON.stringify(f) !== JSON.stringify({
    supplier_name: e.supplier_name ?? '', abn: e.abn ?? '', invoice_number: e.invoice_number ?? '',
    invoice_date: e.invoice_date ?? '', due_date: e.due_date ?? '',
    subtotal: e.subtotal?.toString() ?? '', gst: e.gst?.toString() ?? '', total: e.total?.toString() ?? '',
  });

  async function act(body: object, label: string) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(`/api/payables/${p.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await res.json()) as { payable?: Payable; error?: string };
      if (!res.ok || !data.payable) setError(data.error ?? 'Something went wrong. Please try again.');
      else onChange(data.payable);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  function saveCorrection(ev: FormEvent) {
    ev.preventDefault();
    const n = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[$,\s]/g, '')));
    const t = (s: string) => (s.trim() === '' ? null : s.trim());
    const nums = { subtotal: n(f.subtotal), gst: n(f.gst), total: n(f.total) };
    if (Object.values(nums).some((v) => v !== null && Number.isNaN(v))) { setError('Amounts must be numbers, for example 1677.50.'); return; }
    void act({ action: 'correct', fields: {
      supplier_name: t(f.supplier_name), abn: t(f.abn), invoice_number: t(f.invoice_number),
      invoice_date: t(f.invoice_date), due_date: t(f.due_date), ...nums,
    } }, 'correct');
  }

  const field = (key: keyof typeof f, label: string, hint?: string) => (
    <label className="ap-field">
      <span>{label}</span>
      <input id={`f-${key}`} value={f[key]} placeholder={hint ?? 'not found'}
        onChange={(ev: ChangeEvent<HTMLInputElement>) => setF({ ...f, [key]: ev.target.value })} />
    </label>
  );

  return (
    <section className="ap-review reveal" aria-label="Review">
      <div className="ap-doc">
        <img src={imageOf(p)} alt={`Invoice from ${p.supplier ?? 'unknown supplier'}`} />
      </div>
      <div className="ap-side">
        <div className="ap-side-head">
          <h2>{p.supplier ?? 'Unknown supplier'}</h2>
          <span className={`ap-pill ${p.status}`}>{p.status === 'review' ? 'Waiting for review' : p.status}</span>
        </div>
        <p className="ap-muted">Read by AI{p.edited ? ', corrected by a person' : ''}. Empty fields were not readable: the AI never guesses.</p>

        <CheckList checks={p.checks} />

        <form className="ap-form" onSubmit={saveCorrection}>
          <div className="ap-grid">
            {field('supplier_name', 'Supplier')}
            {field('abn', 'ABN')}
            {field('invoice_number', 'Invoice no.')}
            {field('invoice_date', 'Invoice date', 'YYYY-MM-DD')}
            {field('due_date', 'Due date', 'YYYY-MM-DD')}
            {field('subtotal', 'Subtotal')}
            {field('gst', 'GST')}
            {field('total', 'Total')}
          </div>
          {e.line_items.length > 0 && (
            <details className="ap-lines">
              <summary>{e.line_items.length} line items</summary>
              <table>
                <tbody>
                  {e.line_items.map((l, i) => (
                    <tr key={i}><td>{l.description ?? '–'}</td><td>{l.quantity ?? ''}</td><td>{l.amount !== null ? aud(Math.round(l.amount * 100)) : '–'}</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          {p.status === 'review' && dirty && (
            <button className="ap-btn ghost" disabled={busy !== null}>{busy === 'correct' ? 'Checking again…' : 'Save correction and check again'}</button>
          )}
        </form>

        {p.status === 'review' ? (
          <div className="ap-decide">
            {errors > 0 && (
              <label className="ap-field">
                <span>Approve anyway? Say why (kept with the invoice)</span>
                <input id="decision-note" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="e.g. Supplier confirmed the GST by phone" />
              </label>
            )}
            {error && <p className="ap-error" role="alert">{error}</p>}
            <div className="ap-row">
              <button className="ap-btn" disabled={busy !== null || dirty || (errors > 0 && note.trim().length < 3)}
                onClick={() => void act({ action: 'approve', note: note.trim() || undefined }, 'approve')}>
                {busy === 'approve' ? 'Approving…' : errors > 0 ? 'Approve with note' : 'Approve as cost'}
              </button>
              <button className="ap-btn danger" disabled={busy !== null}
                onClick={() => void act({ action: 'reject', note: note.trim() || undefined }, 'reject')}>
                {busy === 'reject' ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
            {dirty && <p className="ap-muted">Save the correction first, so the checks run on what you approve.</p>}
          </div>
        ) : (
          <p className="ap-decided">
            {p.status === 'approved' ? 'Approved' : 'Rejected'} {p.decided_at ? new Date(p.decided_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
            {p.decision_note ? ` · “${p.decision_note}”` : ''}
          </p>
        )}
      </div>
    </section>
  );
}

export default function Payables() {
  const [items, setItems] = useState<Payable[]>([]);
  const [readsLeft, setReadsLeft] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/payables', { cache: 'no-store' });
      const data = (await res.json()) as { payables: Payable[]; reads_left: number };
      setItems(data.payables);
      setReadsLeft(data.reads_left);
    } catch { /* keep what we have */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!reading) return;
    setPhase(0);
    const t = setTimeout(() => setPhase(1), 2500);
    return () => clearTimeout(t);
  }, [reading]);

  async function read(body: object, label: string) {
    if (reading) return;
    setError(null);
    setReading(label);
    try {
      const res = await fetch('/api/payables/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await res.json()) as { payable?: Payable; error?: string };
      if (!res.ok || !data.payable) setError(data.error ?? 'Something went wrong. Please try again.');
      else { setSelected(data.payable.id); await load(); }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setReading(null);
    }
  }

  async function upload(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) { setError('Please choose a photo or screenshot (JPEG or PNG).'); return; }
    try {
      const image = await downscale(file);
      void read({ image }, file.name);
    } catch {
      setError('Could not open that image. Try a JPEG or PNG.');
    }
  }

  const current = items.find((p) => p.id === selected) ?? null;
  const review = items.filter((p) => p.status === 'review');
  const approved = items.filter((p) => p.status === 'approved');
  const rejected = items.filter((p) => p.status === 'rejected');
  const totals = useMemo(() => {
    const sum = (k: 'total_cents' | 'gst_cents') => approved.reduce((s, p) => s + (p[k] ?? 0), 0);
    const due14 = approved.filter((p) => { const d = daysUntil(p.due_date); return d !== null && d <= 14; })
      .reduce((s, p) => s + (p.total_cents ?? 0), 0);
    return { total: sum('total_cents'), gst: sum('gst_cents'), due14 };
  }, [approved]);

  return (
    <div className="ap">
      <header className="ap-head">
        <div className="ap-brand">
          <img src="/mascot-head.webp" alt="" width={36} height={36} />
          <div><strong>Harbour Study Abroad</strong><span>Accounts payable</span></div>
        </div>
        <span className="ap-reads">{readsLeft === null ? '' : `${readsLeft} AI reads left today`}</span>
      </header>

      <main className="ap-main">
        <section className="ap-intro">
          <h1>Supplier invoices, read by AI and approved by a person</h1>
          <p>Pick an invoice below, or upload a photo of one. The AI copies what is printed, the code checks the numbers, and nothing becomes a cost until someone approves it.</p>
          <Steps active={reading ? phase : current ? 2 : -1} />
        </section>

        <section className="ap-inbox" aria-label="New invoices">
          {SAMPLES.map((s) => (
            <button key={s.key} type="button" className="ap-sample" disabled={!!reading} onClick={() => void read({ sample: s.key }, s.label)}>
              <img src={s.file} alt="" loading="lazy" />
              <span className="ap-sample-label"><b>{s.label}</b><em>{s.hint}</em></span>
              <span className="ap-sample-cta">{reading === s.label ? 'Reading…' : 'Read with AI'}</span>
            </button>
          ))}
          <label className={`ap-upload ${reading ? 'busy' : ''}`}>
            <input id="upload" type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={(ev) => void upload(ev)} disabled={!!reading} />
            <span className="ap-plus" aria-hidden>+</span>
            <b>{reading && !SAMPLES.some((s) => s.label === reading) ? 'Reading…' : 'Upload your own'}</b>
            <em>Photo or screenshot of an invoice or receipt. Please hide personal details.</em>
          </label>
        </section>

        {error && <p className="ap-error banner" role="alert">{error}</p>}
        {reading && <div className="ap-reading reveal" aria-live="polite"><i /> {phase === 0 ? 'The AI is reading the document…' : 'Checking ABN, GST, totals and duplicates…'}</div>}

        {current && <Review key={current.id + current.status + (current.edited ? 'e' : '')} p={current} onChange={(p) => { setItems((xs) => xs.map((x) => (x.id === p.id ? p : x))); }} />}

        <section className="ap-board">
          <div className="ap-stats">
            <div><span>Approved costs</span><b>{aud(totals.total)}</b></div>
            <div><span>GST you can claim</span><b>{aud(totals.gst)}</b></div>
            <div><span>Due in the next 14 days</span><b>{aud(totals.due14)}</b></div>
            <div className={review.length ? 'hot' : ''}><span>Waiting for review</span><b>{review.length}</b></div>
          </div>

          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead><tr><th>Supplier</th><th>Invoice</th><th>Due</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {[...review, ...approved, ...rejected].map((p) => {
                  const d = daysUntil(p.due_date);
                  const flags = p.checks.filter((c) => c.level === 'error').length;
                  return (
                    <tr key={p.id} className={p.id === selected ? 'sel' : ''} onClick={() => setSelected(p.id)}>
                      <td>{p.supplier ?? '–'}{p.source === 'seed' && <em className="ap-tag">last month</em>}</td>
                      <td>{p.invoice_number ?? '–'}</td>
                      <td>{day(p.due_date)}{p.status === 'approved' && d !== null && d <= 7 && <em className="ap-tag warn">{d < 0 ? 'overdue' : `in ${d} d`}</em>}</td>
                      <td className="num">{aud(p.total_cents)}</td>
                      <td>
                        <span className={`ap-pill ${p.status}`}>{p.status === 'review' ? 'Review' : p.status}</span>
                        {p.status === 'review' && flags > 0 && <em className="ap-tag err">{flags} {flags === 1 ? 'problem' : 'problems'}</em>}
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && <tr><td colSpan={5} className="ap-muted">Nothing here yet. Read an invoice above.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <p className="ap-foot">Demo with invented suppliers. Built with n8n, Claude (vision) and Postgres. The AI only extracts; the GST, ABN, totals and duplicate checks run in code. <a href="/">Customer chat</a> · <a href="/admin">Team panel</a></p>
      </main>
    </div>
  );
}
