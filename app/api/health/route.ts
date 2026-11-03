import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public, read-only: counts only, never content.
export async function GET() {
  try {
    const { rows } = await db().query<{
      approved: number; drafts: number; conversations: number; open_errors: number; agent_enabled: boolean; migrations: string[];
    }>(`select
          (select count(*)::int from harbour.facts where approved)          as approved,
          (select count(*)::int from harbour.facts where not approved)      as drafts,
          (select count(*)::int from harbour.conversations)                 as conversations,
          (select count(*)::int from harbour.agent_errors where resolved_at is null) as open_errors,
          (select agent_enabled from harbour.settings where id = 1)         as agent_enabled,
          (select array_agg(file order by file) from harbour.schema_migrations) as migrations`);
    return NextResponse.json({ ok: true, database: rows[0] });
  } catch {
    return NextResponse.json({ ok: false, database: 'unreachable' }, { status: 503 });
  }
}
