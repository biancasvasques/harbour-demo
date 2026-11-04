'use client';

import { useActionState } from 'react';
import { saveSettings } from '../actions';

type S = { instructions: string; after_hours_notice: string; fallback_message: string; handoff_message: string };

export default function SettingsForm({ s }: { s: S }) {
  const [msg, action, pending] = useActionState(saveSettings, null);
  return (
    <form action={action} className="settings">
      <label>Agent instructions<span>What the AI agent reads before every answer.</span>
        <textarea name="instructions" defaultValue={s.instructions} rows={16} required />
      </label>
      <label>Hand-over message<span>Sent when the agent does not know or a guardrail blocks the answer.</span>
        <textarea name="handoff_message" defaultValue={s.handoff_message} rows={3} required />
      </label>
      <label>Fallback message<span>Sent when the AI fails. The team also gets an alert.</span>
        <textarea name="fallback_message" defaultValue={s.fallback_message} rows={3} required />
      </label>
      <label>After-hours notice<span>Added by code outside office hours, at most once every 12 hours.</span>
        <textarea name="after_hours_notice" defaultValue={s.after_hours_notice} rows={3} required />
      </label>
      <div className="save-row">
        <button className="btn" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
        {msg && <span className="saved" role="status">{msg}</span>}
      </div>
    </form>
  );
}
