'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';

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
  is_pdf: boolean;
};
type View = 'upload' | 'result' | 'history';

const SAMPLES = [
  { key: 'bondi-homestay', name: 'Bondi Homestay', hint: 'Everything adds up' },
  { key: 'airport-transfers', name: 'Airport Transfers', hint: 'Something is off with the GST' },
  { key: 'officehub', name: 'OfficeHub Supplies', hint: 'Paid last month already' },
];
const MAX_PDF = 3 * 1024 * 1024;

const aud = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? '–' : (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const day = (iso: string | null) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
const daysUntil = (iso: string | null) => (iso ? Math.round((Date.parse(iso + 'T00:00:00') - Date.now()) / 86_400_000) : null);
const STATUS = { review: 'To review', approved: 'Approved', rejected: 'Rejected' } as const;
const docUrl = (p: Payable) => (p.sample_key ? `/samples/${p.sample_key}.jpg` : `/api/payables/${p.id}/image`);

// Photos are downscaled in the browser: smaller upload, cheaper read, nothing kept at full size.
async function downscale(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}
const asDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

function DocsArt() {
  return (
    <svg className="iv-art" viewBox="0 0 120 96" aria-hidden>
      <rect x="18" y="14" width="56" height="72" rx="8" fill="#fff" opacity="0.35" transform="rotate(-8 46 50)" />
      <rect x="40" y="8" width="58" height="76" rx="8" fill="#fff" />
      <rect x="50" y="20" width="26" height="5" rx="2.5" fill="#c9c5ff" />
      <rect x="50" y="32" width="38" height="4" rx="2" fill="#e9e6ff" />
      <rect x="50" y="41" width="38" height="4" rx="2" fill="#e9e6ff" />
      <rect x="50" y="50" width="30" height="4" rx="2" fill="#e9e6ff" />
      <rect x="66" y="64" width="22" height="6" rx="3" fill="#5e59e8" />
      <circle cx="96" cy="74" r="14" fill="#ff9d5c" />
      <path d="M89.5 74.5l4.5 4.5 8-9" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Tick() {
  return <svg className="iv-tick" viewBox="0 0 20 20" width="18" height="18" aria-hidden><circle cx="10" cy="10" r="10" fill="currentColor" /><path d="M5.8 10.4l2.8 2.8 5.6-6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/* ---------------- one invoice ---------------- */

const FIELDS = [
  { key: 'supplier_name', label: 'Supplier' },
  { key: 'abn', label: 'ABN (business number)' },
  { key: 'invoice_number', label: 'Invoice number' },
  { key: 'invoice_date', label: 'Invoice date', date: true },
  { key: 'due_date', label: 'Due date', date: true },
  { key: 'subtotal', label: 'Amount before GST', money: true },
  { key: 'gst', label: 'GST', money: true },
  { key: 'total', label: 'Total to pay', money: true },
] as const;
type FieldKey = (typeof FIELDS)[number]['key'];

function valuesOf(e: Extracted): Record<FieldKey, string> {
  return {
    supplier_name: e.supplier_name ?? '', abn: e.abn ?? '', invoice_number: e.invoice_number ?? '',
    invoice_date: e.invoice_date ?? '', due_date: e.due_date ?? '',
    subtotal: e.subtotal?.toFixed(2) ?? '', gst: e.gst?.toFixed(2) ?? '', total: e.total?.toFixed(2) ?? '',
  };
}

function Result({ p, onChange, onBack }: { p: Payable; onChange: (p: Payable) => void; onBack: () => void }) {
  const e = p.extracted;
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(valuesOf(e));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const problems = p.checks.filter((c) => c.level === 'error');
  const warnings = p.checks.filter((c) => c.level === 'warning');
  const passed = p.checks.filter((c) => c.level === 'ok');
  const flagged = problems.length + warnings.length;
  const passedLine = passed.map((c) => c.message.replace(/\.$/, '')).join(' · ');

  async function act(body: object, label: string) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(`/api/payables/${p.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await res.json()) as { payable?: Payable; error?: string };
      if (!res.ok || !data.payable) setError(data.error ?? 'Something went wrong. Please try again.');
      else { setEditing(false); onChange(data.payable); }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  function save(ev: FormEvent) {
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

  const shown = (k: FieldKey, money: boolean, date: boolean) => {
    const v = e[k as keyof Extracted] as string | number | null;
    if (v === null || v === '') return <span className="iv-missing">Not on the document</span>;
    if (money) return aud(Math.round(Number(v) * 100));
    if (date) return day(String(v)) ?? String(v);
    return String(v);
  };

  return (
    <section className="iv-result reveal" aria-label="Invoice">
      <button type="button" className="iv-back" onClick={onBack}>← Check another invoice</button>

      <div className="iv-res-grid">
        <div className="iv-doc">
          {p.is_pdf
            ? <><iframe src={`${docUrl(p)}#toolbar=0&view=FitH`} title="The invoice" /><a className="iv-open" href={docUrl(p)} target="_blank" rel="noreferrer">Open the PDF in a new tab</a></>
            : <img src={docUrl(p)} alt={`Invoice from ${p.supplier ?? 'unknown supplier'}`} />}
        </div>

        <div className="iv-side">
          <div className="iv-title">
            <div>
              <h2>{p.supplier ?? 'Unknown supplier'}</h2>
              <p>{[p.invoice_number && `Invoice ${p.invoice_number}`, p.total_cents !== null && aud(p.total_cents)].filter(Boolean).join(' · ')}</p>
            </div>
            <span className={`iv-pill ${p.status}`}>{STATUS[p.status]}</span>
          </div>

          {flagged === 0 ? (
            <div className="iv-verdict good"><Tick /><div><b>Everything checks out.</b>{passedLine && <span>{passedLine}</span>}</div></div>
          ) : (
            <div className={`iv-verdict ${problems.length ? 'bad' : 'warn'}`}>
              <b>{problems.length ? `${flagged} ${flagged === 1 ? 'thing needs' : 'things need'} your attention` : 'Worth a second look'}</b>
              <ul>{[...problems, ...warnings].map((c) => <li key={c.code} className={`is-${c.level}`}>{c.message}</li>)}</ul>
              {passedLine && <span className="iv-passed"><Tick /> {passedLine}</span>}
            </div>
          )}

          {editing ? (
            <form className="iv-form" onSubmit={save}>
              {FIELDS.map((d) => (
                <label key={d.key}>
                  <span>{d.label}</span>
                  <input id={`f-${d.key}`} type={'date' in d ? 'date' : 'text'} inputMode={'money' in d ? 'decimal' : undefined}
                    value={f[d.key]} onChange={(ev: ChangeEvent<HTMLInputElement>) => setF({ ...f, [d.key]: ev.target.value })} />
                </label>
              ))}
              {error && <p className="iv-error" role="alert">{error}</p>}
              <div className="iv-row">
                <button className="iv-btn" disabled={busy !== null}>{busy === 'correct' ? 'Checking again…' : 'Save and check again'}</button>
                <button type="button" className="iv-btn ghost" onClick={() => { setEditing(false); setF(valuesOf(e)); setError(null); }}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="iv-read">
              <div className="iv-read-head">
                <h3>What we read</h3>
                {p.status === 'review' && <button type="button" className="iv-link" onClick={() => setEditing(true)}>Fix a field</button>}
              </div>
              <dl>
                {FIELDS.map((d) => (
                  <div key={d.key} className={d.key === 'total' ? 'total' : ''}>
                    <dt>{d.label}</dt><dd>{shown(d.key, 'money' in d, 'date' in d)}</dd>
                  </div>
                ))}
              </dl>
              {e.line_items.length > 0 && (
                <details className="iv-lines">
                  <summary>{e.line_items.length} {e.line_items.length === 1 ? 'item' : 'items'} on the invoice</summary>
                  <table><tbody>
                    {e.line_items.map((l, i) => (
                      <tr key={i}><td>{l.description ?? '–'}</td><td>{l.quantity !== null ? `× ${l.quantity}` : ''}</td><td>{l.amount !== null ? aud(Math.round(l.amount * 100)) : '–'}</td></tr>
                    ))}
                  </tbody></table>
                </details>
              )}
              {p.edited && <p className="iv-note">Corrected by a person after the AI read it.</p>}
            </div>
          )}

          {p.status === 'review' && !editing && (
            <div className="iv-decide">
              {problems.length > 0 && (
                <label className="iv-why">
                  <span>To approve it anyway, say why</span>
                  <input id="decision-note" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="e.g. Supplier confirmed the GST by phone" />
                </label>
              )}
              {error && <p className="iv-error" role="alert">{error}</p>}
              <div className="iv-row">
                <button className="iv-btn" disabled={busy !== null || (problems.length > 0 && note.trim().length < 3)}
                  onClick={() => void act({ action: 'approve', note: note.trim() || undefined }, 'approve')}>
                  {busy === 'approve' ? 'Approving…' : 'Approve for payment'}
                </button>
                <button className="iv-btn ghost danger" disabled={busy !== null}
                  onClick={() => void act({ action: 'reject', note: note.trim() || undefined }, 'reject')}>
                  {busy === 'reject' ? 'Rejecting…' : 'Reject'}
                </button>
              </div>
            </div>
          )}
          {p.status !== 'review' && (
            <p className="iv-decided">
              {STATUS[p.status]} {p.decided_at ? new Date(p.decided_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
              {p.decision_note ? ` · “${p.decision_note}”` : ''}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------------- page ---------------- */

export default function Payables() {
  const [items, setItems] = useState<Payable[]>([]);
  const [readsLeft, setReadsLeft] = useState<number | null>(null);
  const [view, setView] = useState<View>('upload');
  const [selected, setSelected] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [phase, setPhase] = useState(0);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

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
    const t = setTimeout(() => setPhase(1), 3000);
    return () => clearTimeout(t);
  }, [reading]);

  function open(id: string) { setSelected(id); setView('result'); window.scrollTo({ top: 0 }); }

  async function read(body: object, label: string) {
    if (reading) return;
    setError(null);
    setReading(label);
    try {
      const res = await fetch('/api/payables/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await res.json()) as { payable?: Payable; error?: string };
      if (!res.ok || !data.payable) setError(data.error ?? 'Something went wrong. Please try again.');
      else { await load(); open(data.payable.id); }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setReading(null);
    }
  }

  async function take(file: File | undefined) {
    if (!file || reading) return;
    setError(null);
    try {
      if (file.type === 'application/pdf') {
        if (file.size > MAX_PDF) { setError('That PDF is over 3 MB. Try a smaller one, or a photo of the page.'); return; }
        void read({ image: await asDataUrl(file) }, file.name);
      } else if (/^image\/(jpeg|png|webp)$/.test(file.type)) {
        void read({ image: await downscale(file) }, file.name);
      } else {
        setError('Please choose a PDF, JPG or PNG.');
      }
    } catch {
      setError('Could not open that file. Try a PDF, JPG or PNG.');
    }
  }

  function drop(ev: DragEvent) { ev.preventDefault(); setOver(false); void take(ev.dataTransfer.files?.[0]); }

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
    <div className="iv">
      <header className="iv-head">
        <a className="iv-brand" href="/invoices" onClick={(ev) => { ev.preventDefault(); setView('upload'); }}>
          <img src="/mascot-head.webp" alt="" width={32} height={32} />
          <span><strong>Harbour</strong> Invoices</span>
        </a>
        <nav className="iv-tabs" aria-label="Sections">
          <button type="button" className={view !== 'history' ? 'on' : ''} onClick={() => setView('upload')}>Check an invoice</button>
          <button type="button" className={view === 'history' ? 'on' : ''} onClick={() => setView('history')}>
            History{review.length > 0 && <i>{review.length}</i>}
          </button>
        </nav>
      </header>

      <main className="iv-main">
        {view === 'upload' && (
          <section className="iv-home reveal">
            <h1>Check a supplier invoice</h1>
            <p className="iv-sub">Drop in a PDF or a photo. We read it, check the numbers, and nothing gets paid until you approve.</p>

            <div className={`iv-drop ${over ? 'over' : ''} ${reading ? 'busy' : ''}`}
              onDragOver={(ev) => { ev.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
              <div className="iv-drop-in">
                {reading ? (
                  <div className="iv-reading" aria-live="polite">
                    <i />
                    <b>{phase === 0 ? 'Reading the invoice…' : 'Checking the numbers…'}</b>
                    <span>{reading}</span>
                  </div>
                ) : (
                  <>
                    <DocsArt />
                    <button type="button" className="iv-choose" onClick={() => input.current?.click()}>
                      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
                      Choose a file
                    </button>
                    <span className="iv-drop-hint">or drop it here · PDF, JPG or PNG, up to 3&nbsp;MB</span>
                  </>
                )}
                <input ref={input} id="upload" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden
                  onChange={(ev) => { const file = ev.target.files?.[0]; ev.target.value = ''; void take(file); }} />
              </div>
            </div>
            {error && <p className="iv-error banner" role="alert">{error}</p>}

            <div className="iv-try">
              <h2>No invoice at hand? Try one of ours</h2>
              <div className="iv-samples">
                {SAMPLES.map((s) => (
                  <div key={s.key} className="iv-sample">
                    <img src={`/samples/${s.key}.jpg`} alt="" loading="lazy" />
                    <div>
                      <b>{s.name}</b>
                      <span>{s.hint}</span>
                      <div className="iv-sample-actions">
                        <button type="button" disabled={!!reading} onClick={() => void read({ sample: s.key }, `${s.name} invoice`)}>Check it</button>
                        <a href={`/samples/${s.key}.pdf`} download={`${s.key}-invoice.pdf`}>Download PDF</a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <ul className="iv-feats">
              <li><Tick /><div><b>Reads PDFs and photos</b><span>Supplier, ABN, dates, items, GST and total, copied exactly as printed.</span></div></li>
              <li><Tick /><div><b>Checks the numbers</b><span>GST at 10%, totals that add up, a real ABN, and invoices already paid.</span></div></li>
              <li><Tick /><div><b>You have the last word</b><span>Approve or reject. Every decision is kept with the invoice.</span></div></li>
            </ul>
          </section>
        )}

        {view === 'result' && current && (
          <Result key={current.id + current.status + (current.edited ? 'e' : '') + JSON.stringify(current.extracted).length} p={current}
            onChange={(p) => setItems((xs) => xs.map((x) => (x.id === p.id ? p : x)))} onBack={() => setView('upload')} />
        )}

        {view === 'history' && (
          <section className="iv-history reveal">
            <h1>History</h1>
            <div className="iv-stats">
              <div><span>Approved to pay</span><b>{aud(totals.total)}</b></div>
              <div><span>GST you can claim back</span><b>{aud(totals.gst)}</b></div>
              <div><span>Due in the next 14 days</span><b>{aud(totals.due14)}</b></div>
              <div className={review.length ? 'hot' : ''}><span>Waiting for you</span><b>{review.length}</b></div>
            </div>
            <div className="iv-table-wrap">
              <table className="iv-table">
                <thead><tr><th>Supplier</th><th>Invoice</th><th>Due</th><th className="num">Total</th><th>Status</th></tr></thead>
                <tbody>
                  {[...review, ...approved, ...rejected].map((p) => {
                    const d = daysUntil(p.due_date);
                    const flags = p.checks.filter((c) => c.level === 'error').length;
                    return (
                      <tr key={p.id} onClick={() => open(p.id)} tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') open(p.id); }}>
                        <td>{p.supplier ?? '–'}{p.source === 'seed' && <em className="iv-tag">last month</em>}</td>
                        <td>{p.invoice_number ?? '–'}</td>
                        <td>{day(p.due_date) ?? '–'}{p.status === 'approved' && d !== null && d <= 7 && <em className="iv-tag warn">{d < 0 ? 'overdue' : `in ${d} d`}</em>}</td>
                        <td className="num">{aud(p.total_cents)}</td>
                        <td>
                          <span className={`iv-pill ${p.status}`}>{STATUS[p.status]}</span>
                          {p.status === 'review' && flags > 0 && <em className="iv-tag err">{flags} {flags === 1 ? 'issue' : 'issues'}</em>}
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && <tr><td colSpan={5} className="iv-empty">Nothing here yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <footer className="iv-foot">
          Demo with invented suppliers. Claude reads the document, the checks run in code, a person decides.
          {readsLeft !== null && ` ${readsLeft} reads left today.`} <a href="/">Customer chat</a> · <a href="/admin">Team panel</a>
        </footer>
      </main>
    </div>
  );
}
