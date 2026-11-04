import Link from 'next/link';
import type { ReactNode } from 'react';
import { db } from '@/lib/db';
import { logout, toggleAgent, toggleFailure } from './actions';

// Top bar shared by every panel page: navigation and the two live switches.
export default async function Shell({ active, children }: { active: string; children: ReactNode }) {
  const s = (await db().query<{ agent_enabled: boolean; simulate_ai_failure: boolean; open_errors: number }>(
    `select agent_enabled, simulate_ai_failure,
            (select count(*)::int from harbour.agent_errors where resolved_at is null) as open_errors
       from harbour.settings where id = 1`,
  )).rows[0];
  const nav = [
    ['/admin', 'Conversations'],
    ['/admin/knowledge', 'Knowledge'],
    ['/admin/bookings', 'Bookings'],
    ['/invoices', 'Invoices'],
    ['/admin/settings', 'Settings'],
  ];
  return (
    <>
      <header className="topbar">
        <div className="tb-brand">
          <img src="/mascot-head.webp" alt="" width={32} height={32} />
          <div><strong>Harbour</strong><span>Team panel</span></div>
        </div>
        <nav>
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className={active === href ? 'on' : ''}>
              {label}
              {href === '/admin' && s.open_errors > 0 && <em className="count">{s.open_errors}</em>}
            </Link>
          ))}
        </nav>
        <div className="tb-actions">
          <form action={toggleAgent}>
            <button className={`switch ${s.agent_enabled ? 'on' : ''}`} title="Switch the AI agent on or off">
              <i /> Agent {s.agent_enabled ? 'on' : 'off'}
            </button>
          </form>
          <form action={toggleFailure}>
            <button className={`switch danger ${s.simulate_ai_failure ? 'on' : ''}`} title="Make the next AI call fail, to show the fallback and the alert">
              <i /> Simulate AI failure
            </button>
          </form>
          <a className="ghost-btn" href="/" target="_blank" rel="noreferrer">Open chat</a>
          <form action={logout}><button className="ghost-btn">Log out</button></form>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
