// Small presentational helpers for the panel.
export const STATUS: Record<string, { label: string; tone: string }> = {
  bot: { label: 'Agent answering', tone: 'violet' },
  needs_human: { label: 'Needs a person', tone: 'amber' },
  human: { label: 'Team answering', tone: 'green' },
  closed: { label: 'Closed', tone: 'grey' },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: 'grey' };
  return <span className={`pill ${s.tone}`}>{s.label}</span>;
}

export function ago(iso: string | Date): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function Stars({ n }: { n: number }) {
  return <span className="stars-sm" aria-label={`${n} out of 5`}>{'★'.repeat(n)}<span>{'★'.repeat(5 - n)}</span></span>;
}
