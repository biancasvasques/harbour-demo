import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import Shell from './shell';
import AutoRefresh from './refresh';
import ConfirmButton from './confirm-button';
import { resetDemo, resolveAllErrors, resolveError } from './actions';
import { STATUS, StatusPill, Stars, ago } from './ui';

export const dynamic = 'force-dynamic';

type Row = {
  id: string; visitor_name: string | null; status: string; status_reason: string | null; has_error: boolean;
  visitor_messages: number; last_message_at: string; rating: number | null; last: string | null; last_role: string | null;
};
type Err = { id: string; conversation_id: string | null; kind: string; detail: string; created_at: string };

const FILTERS = ['all', 'needs_human', 'human', 'bot', 'closed'] as const;

export default async function Conversations({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await requireAdmin();
  const { f } = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(f ?? '') ? f! : 'all';

  const rows = (await db().query<Row>(
    `select c.id, c.visitor_name, c.status, c.status_reason, c.has_error, c.visitor_messages, c.last_message_at, c.rating,
            m.content as last, m.role as last_role
       from harbour.conversations c
       left join lateral (select content, role from harbour.messages where conversation_id = c.id
                           order by created_at desc, id desc limit 1) m on true
      where ($1 = 'all' or c.status = $1)
      order by (c.status = 'needs_human') desc, c.last_message_at desc
      limit 100`,
    [filter],
  )).rows;
  const counts = Object.fromEntries((await db().query<{ status: string; n: number }>(
    'select status, count(*)::int as n from harbour.conversations group by status',
  )).rows.map((r) => [r.status, r.n]));
  const total = Object.values(counts).reduce((a: number, b) => a + (b as number), 0);
  const errors = (await db().query<Err>(
    'select id, conversation_id, kind, detail, created_at from harbour.agent_errors where resolved_at is null order by created_at desc limit 10',
  )).rows;
  const stats = (await db().query<{ today: number; rated: number; avg: string | null; bookings: number }>(
    `select (select count(*)::int from harbour.messages where role = 'visitor' and created_at > now() - interval '24 hours') as today,
            (select count(*)::int from harbour.conversations where rating is not null) as rated,
            (select round(avg(rating)::numeric, 1)::text from harbour.conversations where rating is not null) as avg,
            (select count(*)::int from harbour.bookings where status <> 'cancelled') as bookings`,
  )).rows[0];

  return (
    <Shell active="/admin">
      <AutoRefresh />
      {errors.length > 0 && (
        <section className="alert" role="alert">
          <div className="alert-head">
            <strong>⚠ The agent had {errors.length === 1 ? 'a problem' : `${errors.length} problems`}</strong>
            <span>The visitor got the fallback message and the conversation was marked for a person.</span>
            <form action={resolveAllErrors}><button className="ghost-btn">Resolve all</button></form>
          </div>
          <ul>
            {errors.map((e) => (
              <li key={e.id}>
                <code>{e.kind}</code>
                <span className="detail">{e.detail}</span>
                <span className="muted">{ago(e.created_at)}</span>
                {e.conversation_id && <Link href={`/admin/c/${e.conversation_id}`}>Open</Link>}
                <form action={resolveError}><input type="hidden" name="error_id" value={e.id} /><button className="link-btn">Resolve</button></form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="stats">
        <div><strong>{total}</strong><span>conversations</span></div>
        <div className={counts.needs_human ? 'hot' : ''}><strong>{counts.needs_human ?? 0}</strong><span>need a person</span></div>
        <div><strong>{stats.today}</strong><span>visitor messages (24 h)</span></div>
        <div><strong>{stats.bookings}</strong><span>bookings</span></div>
        <div><strong>{stats.avg ?? '–'}</strong><span>avg rating ({stats.rated})</span></div>
      </section>

      <div className="list-head">
        <div className="tabs">
          {FILTERS.map((k) => (
            <Link key={k} href={k === 'all' ? '/admin' : `/admin?f=${k}`} className={filter === k ? 'on' : ''}>
              {k === 'all' ? 'All' : STATUS[k].label}
              <em>{k === 'all' ? total : counts[k] ?? 0}</em>
            </Link>
          ))}
        </div>
        <form action={resetDemo}>
          <ConfirmButton className="ghost-btn danger" message="Reset the demo? This deletes every conversation, booking and alert, and reloads the original facts and instructions.">
            Reset demo
          </ConfirmButton>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="empty">No conversations here yet. Open the chat and send a message.</p>
      ) : (
        <ul className="convs">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/c/${r.id}`} className={`conv ${r.status}`}>
                <span className="who">
                  {r.visitor_name ?? 'Visitor'}
                  {r.has_error && <em className="err-dot" title="AI error in this conversation">!</em>}
                </span>
                <span className="last">
                  {r.last_role && r.last_role !== 'visitor' && <b>{r.last_role === 'agent' ? 'AI: ' : r.last_role === 'staff' ? 'Team: ' : 'Note: '}</b>}
                  {r.last ?? '–'}
                </span>
                <span className="side">
                  <StatusPill status={r.status} />
                  {r.rating && <Stars n={r.rating} />}
                  <span className="muted">{ago(r.last_message_at)}</span>
                </span>
                {r.status === 'needs_human' && r.status_reason && <span className="reason">{r.status_reason}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
