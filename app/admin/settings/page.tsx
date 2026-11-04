import { requireAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import Shell from '../shell';
import SettingsForm from './form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requireAdmin();
  const s = (await db().query<{ instructions: string; after_hours_notice: string; fallback_message: string; handoff_message: string; timezone: string }>(
    'select instructions, after_hours_notice, fallback_message, handoff_message, timezone from harbour.settings where id = 1',
  )).rows[0];
  return (
    <Shell active="/admin/settings">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Instructions change the tone and the rules. They can not change the reply format or the guardrails: those are fixed in the workflow and checked in code (approved facts only, no prices, discounts or exact dates). Office hours: {s.timezone}.</p>
        </div>
      </div>
      <SettingsForm s={s} />
    </Shell>
  );
}
