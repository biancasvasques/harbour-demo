import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import Shell from '../../shell';
import AutoRefresh from '../../refresh';
import { closeConversation, handBack, staffReply, takeOver } from '../../actions';
import { StatusPill, Stars, ago } from '../../ui';

export const dynamic = 'force-dynamic';

type Conv = {
  id: string; visitor_name: string | null; visitor_email: string | null; status: string; status_reason: string | null;
  has_error: boolean; visitor_messages: number; created_at: string; rating: number | null; rating_comment: string | null;
};
type Msg = { id: string; role: string; content: string; fact_codes: string[]; meta: Record<string, unknown>; created_at: string };
type Booking = { ref: string; slot_start: string; mode: string; status: string };

const ROUTE_LABEL: Record<string, string> = {
  ready_answer: 'Ready answer · no AI',
  claude: 'Claude',
  booking_offer: 'Booking offer · no AI',
  booking_done: 'Booking tool',
  goodbye: 'Goodbye + survey · no AI',
  agent_off: 'Agent off',
};

function Tags({ m }: { m: Msg }) {
  const t: { text: string; tone: string }[] = [];
  const meta = m.meta;
  if (typeof meta.route === 'string') t.push({ text: ROUTE_LABEL[meta.route] ?? meta.route, tone: meta.route === 'claude' ? 'violet' : 'grey' });
  if (m.fact_codes.length) t.push({ text: `Facts ${m.fact_codes.join(', ')}`, tone: 'green' });
  if (meta.knew === false) t.push({ text: 'Did not know → person', tone: 'amber' });
  if (typeof meta.guardrail === 'string' && meta.guardrail) t.push({ text: `Guardrail: ${meta.guardrail}`, tone: 'amber' });
  if (meta.fallback) t.push({ text: `Fallback (${String(meta.error ?? 'error')})`, tone: 'red' });
  if (meta.after_hours) t.push({ text: 'After-hours notice', tone: 'grey' });
  if (meta.booking) t.push({ text: 'Booking confirmed', tone: 'green' });
  if (!t.length) return null;
  return <div className="tags">{t.map((x) => <span key={x.text} className={`tag ${x.tone}`}>{x.text}</span>)}</div>;
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const c = (await db().query<Conv>(
    `select id, visitor_name, visitor_email, status, status_reason, has_error, visitor_messages, created_at, rating, rating_comment
       from harbour.conversations where id = $1`, [id])).rows[0];
  if (!c) notFound();
  const msgs = (await db().query<Msg>(
    'select id, role, content, fact_codes, meta, created_at from harbour.messages where conversation_id = $1 order by created_at, id', [id])).rows;
  const bookings = (await db().query<Booking>(
    'select ref, slot_start, mode, status from harbour.bookings where conversation_id = $1 order by created_at', [id])).rows;

  const human = c.status === 'human';
  return (
    <Shell active="/admin">
      <AutoRefresh />
      <Link href="/admin" className="back">← All conversations</Link>
      <div className="detail">
        <section className="thread">
          <header className="thread-head">
            <div>
              <h1>{c.visitor_name ?? 'Visitor'}</h1>
              <p className="muted">{c.visitor_email ?? 'No email yet'} · started {ago(c.created_at)} · {c.visitor_messages} visitor messages</p>
            </div>
            <StatusPill status={c.status} />
          </header>

          <ol className="timeline">
            {msgs.map((m) => (
              <li key={m.id} className={`msg ${m.role}`}>
                <div className="msg-meta">
                  <b>{m.role === 'visitor' ? (c.visitor_name ?? 'Visitor') : m.role === 'agent' ? 'AI assistant' : m.role === 'staff' ? `${String(m.meta.author ?? 'Team')} · team` : 'System note'}</b>
                  <span>{new Date(m.created_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}</span>
                </div>
                <div className="msg-body">{m.content}</div>
                <Tags m={m} />
              </li>
            ))}
          </ol>

          <form action={staffReply} className="reply">
            <input type="hidden" name="id" value={c.id} />
            <input name="author" defaultValue="Alex" aria-label="Your name" className="author" maxLength={40} required />
            <textarea name="content" placeholder={human ? 'Write to the visitor…' : 'Write to the visitor (sending takes the conversation over)…'} rows={2} maxLength={1000} required />
            <button className="btn">Send</button>
          </form>
        </section>

        <aside className="side-panel">
          <div className="card-box">
            <h2>Who is answering</h2>
            <p className="muted">{c.status_reason ?? (c.status === 'bot' ? 'The AI agent answers this conversation.' : '')}</p>
            <div className="stack-btns">
              {!human && <form action={takeOver}><input type="hidden" name="id" value={c.id} /><button className="btn">Take over</button></form>}
              {c.status !== 'bot' && <form action={handBack}><input type="hidden" name="id" value={c.id} /><button className="ghost-btn">Hand back to the agent</button></form>}
              {c.status !== 'closed' && <form action={closeConversation}><input type="hidden" name="id" value={c.id} /><button className="ghost-btn">Close</button></form>}
            </div>
            <p className="hint">While the team is answering, the agent stays silent in this conversation.</p>
          </div>

          {bookings.length > 0 && (
            <div className="card-box">
              <h2>Bookings</h2>
              {bookings.map((b) => (
                <p key={b.ref}><b>{b.ref}</b> · {new Date(b.slot_start).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {b.mode} · {b.status}</p>
              ))}
            </div>
          )}

          {c.rating && (
            <div className="card-box">
              <h2>Satisfaction</h2>
              <p><Stars n={c.rating} /></p>
              {c.rating_comment && <p className="quote">“{c.rating_comment}”</p>}
            </div>
          )}

          {c.has_error && (
            <div className="card-box warn">
              <h2>AI error</h2>
              <p className="muted">The agent failed in this conversation. The visitor got the fallback message.</p>
            </div>
          )}
        </aside>
      </div>
    </Shell>
  );
}
