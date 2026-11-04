import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import Shell from '../shell';
import { setBookingStatus } from '../actions';

export const dynamic = 'force-dynamic';

type B = { id: string; ref: string; name: string; email: string; mode: string; slot_start: string; status: string; conversation_id: string | null };

export default async function Bookings() {
  await requireAdmin();
  const rows = (await db().query<B>(
    'select id, ref, name, email, mode, slot_start, status, conversation_id from harbour.bookings order by slot_start',
  )).rows;
  const when = (iso: string) => new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return (
    <Shell active="/admin/bookings">
      <div className="page-head">
        <div>
          <h1>Bookings</h1>
          <p className="muted">Booked from the chat. Times come from office hours (Sydney), the reservation is made by code, and the same time can never be booked twice.</p>
        </div>
      </div>
      {rows.length === 0 ? <p className="empty">No bookings yet. In the chat, click “Book a free consultation”.</p> : (
        <table className="table">
          <thead><tr><th>Ref</th><th>When (Sydney)</th><th>Name</th><th>Email</th><th>Where</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className={b.status}>
                <td><b>{b.ref}</b></td>
                <td>{when(b.slot_start)}</td>
                <td>{b.conversation_id ? <Link href={`/admin/c/${b.conversation_id}`}>{b.name}</Link> : b.name}</td>
                <td>{b.email}</td>
                <td>{b.mode === 'online' ? 'Online' : 'Office'}</td>
                <td><span className={`pill ${b.status === 'confirmed' ? 'green' : b.status === 'cancelled' ? 'grey' : 'amber'}`}>{b.status}</span></td>
                <td className="row-btns">
                  {b.status === 'requested' && (
                    <form action={setBookingStatus}><input type="hidden" name="booking_id" value={b.id} /><input type="hidden" name="status" value="confirmed" /><button className="link-btn">Confirm</button></form>
                  )}
                  {b.status !== 'cancelled' && (
                    <form action={setBookingStatus}><input type="hidden" name="booking_id" value={b.id} /><input type="hidden" name="status" value="cancelled" /><button className="link-btn danger">Cancel</button></form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Shell>
  );
}
