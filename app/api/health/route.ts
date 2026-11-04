import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { askAgent } from '@/lib/agent';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

// Public, read-only: counts only, never content.
//   /api/health            database check
//   /api/health?agent=1    + one fixed question through app -> n8n -> Claude (nothing saved)
//   /api/health?agent=fail + the same, forcing the AI failure path
export async function GET(req: Request) {
  const agent = new URL(req.url).searchParams.get('agent');
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

    if (agent !== '1' && agent !== 'fail') return NextResponse.json({ ok: true, database: rows[0] });

    const s = (await db().query<{ instructions: string }>('select instructions from harbour.settings where id = 1')).rows[0];
    const facts = (await db().query<{ code: string; title: string; content: string }>(
      'select code, title, content from harbour.facts where approved order by code',
    )).rows;
    const started = Date.now();
    const result = await askAgent({
      kind: 'message',
      conversation_id: '00000000-0000-0000-0000-000000000000',
      message: 'Which languages do your consultants speak?',
      status: 'bot',
      agent_enabled: true,
      instructions: s.instructions,
      facts,
      quick: [],
      history: [],
      simulate_failure: agent === 'fail',
    });
    return NextResponse.json({ ok: true, database: rows[0], agent_check: { ms: Date.now() - started, ...result } });
  } catch {
    return NextResponse.json({ ok: false, database: 'unreachable' }, { status: 503 });
  }
}
