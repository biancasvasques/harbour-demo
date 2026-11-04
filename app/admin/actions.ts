'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { endSession, isAdmin, passwordMatches, requireAdmin, startSession } from '@/lib/admin-auth';

// Every action checks the session itself: a server action is a public endpoint.

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const password = String(form.get('password') ?? '');
  if (!passwordMatches(password)) return 'Wrong password.';
  await startSession();
  redirect('/admin');
}

export async function logout(): Promise<void> {
  await endSession();
  redirect('/admin/login');
}

const Id = z.string().uuid();
const str = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

// ---- conversations --------------------------------------------------------

export async function takeOver(form: FormData): Promise<void> {
  await requireAdmin();
  const id = Id.parse(str(form, 'id'));
  await db().query(`update harbour.conversations set status = 'human', status_reason = 'Taken over by the team' where id = $1`, [id]);
  revalidatePath(`/admin/c/${id}`);
  revalidatePath('/admin');
}

export async function handBack(form: FormData): Promise<void> {
  await requireAdmin();
  const id = Id.parse(str(form, 'id'));
  await db().query(`update harbour.conversations set status = 'bot', status_reason = 'Handed back to the agent' where id = $1`, [id]);
  revalidatePath(`/admin/c/${id}`);
  revalidatePath('/admin');
}

export async function closeConversation(form: FormData): Promise<void> {
  await requireAdmin();
  const id = Id.parse(str(form, 'id'));
  await db().query(`update harbour.conversations set status = 'closed', status_reason = 'Closed by the team' where id = $1`, [id]);
  revalidatePath(`/admin/c/${id}`);
  revalidatePath('/admin');
}

const Reply = z.object({ id: Id, author: z.string().trim().min(1).max(40), content: z.string().trim().min(1).max(1000) });

// A staff reply takes the conversation over, so the agent stops answering.
export async function staffReply(form: FormData): Promise<void> {
  await requireAdmin();
  const r = Reply.safeParse({ id: str(form, 'id'), author: str(form, 'author'), content: str(form, 'content') });
  if (!r.success) return;
  await db().query(
    `insert into harbour.messages (conversation_id, role, content, meta) values ($1, 'staff', $2, $3)`,
    [r.data.id, r.data.content, JSON.stringify({ author: r.data.author })],
  );
  await db().query(
    `update harbour.conversations set status = 'human', status_reason = 'Team is replying', last_message_at = now() where id = $1`,
    [r.data.id],
  );
  revalidatePath(`/admin/c/${r.data.id}`);
  revalidatePath('/admin');
}

// ---- alerts ---------------------------------------------------------------

export async function resolveError(form: FormData): Promise<void> {
  await requireAdmin();
  const id = str(form, 'error_id');
  if (!Id.safeParse(id).success) return;
  await db().query('update harbour.agent_errors set resolved_at = now() where id = $1 and resolved_at is null', [id]);
  revalidatePath('/admin');
}

export async function resolveAllErrors(): Promise<void> {
  await requireAdmin();
  await db().query('update harbour.agent_errors set resolved_at = now() where resolved_at is null');
  await db().query('update harbour.conversations set has_error = false where has_error');
  revalidatePath('/admin');
}

// ---- settings -------------------------------------------------------------

export async function toggleAgent(): Promise<void> {
  await requireAdmin();
  await db().query('update harbour.settings set agent_enabled = not agent_enabled where id = 1');
  revalidatePath('/admin', 'layout');
}

export async function toggleFailure(): Promise<void> {
  await requireAdmin();
  await db().query('update harbour.settings set simulate_ai_failure = not simulate_ai_failure where id = 1');
  revalidatePath('/admin', 'layout');
}

const Settings = z.object({
  instructions: z.string().trim().min(20).max(20000),
  after_hours_notice: z.string().trim().min(5).max(1000),
  fallback_message: z.string().trim().min(5).max(1000),
  handoff_message: z.string().trim().min(5).max(1000),
});

export async function saveSettings(_prev: string | null, form: FormData): Promise<string | null> {
  if (!(await isAdmin())) return 'Your session expired. Please log in again.';
  const r = Settings.safeParse({
    instructions: str(form, 'instructions'),
    after_hours_notice: str(form, 'after_hours_notice'),
    fallback_message: str(form, 'fallback_message'),
    handoff_message: str(form, 'handoff_message'),
  });
  if (!r.success) return 'Every field needs some text (instructions at least 20 characters).';
  await db().query(
    `update harbour.settings set instructions = $1, after_hours_notice = $2, fallback_message = $3, handoff_message = $4 where id = 1`,
    [r.data.instructions, r.data.after_hours_notice, r.data.fallback_message, r.data.handoff_message],
  );
  revalidatePath('/admin/settings');
  return 'Saved. The next message already uses these instructions.';
}

// ---- knowledge (facts) ----------------------------------------------------

const Fact = z.object({
  title: z.string().trim().min(2).max(120),
  topic: z.string().trim().min(2).max(60),
  content: z.string().trim().min(5).max(2000),
});

export async function saveFact(form: FormData): Promise<void> {
  await requireAdmin();
  const code = str(form, 'code');
  const r = Fact.safeParse({ title: str(form, 'title'), topic: str(form, 'topic'), content: str(form, 'content') });
  if (!/^F\d{2,3}$/.test(code) || !r.success) return;
  await db().query('update harbour.facts set title = $2, topic = $3, content = $4 where code = $1',
    [code, r.data.title, r.data.topic, r.data.content]);
  revalidatePath('/admin/knowledge');
}

export async function toggleFact(form: FormData): Promise<void> {
  await requireAdmin();
  const code = str(form, 'code');
  if (!/^F\d{2,3}$/.test(code)) return;
  await db().query('update harbour.facts set approved = not approved where code = $1', [code]);
  revalidatePath('/admin/knowledge');
}

export async function addFact(form: FormData): Promise<void> {
  await requireAdmin();
  const r = Fact.safeParse({ title: str(form, 'title'), topic: str(form, 'topic'), content: str(form, 'content') });
  if (!r.success) return;
  // new facts start as drafts: the agent only sees them once someone approves
  await db().query(
    `insert into harbour.facts (code, topic, title, content, approved)
     select 'F' || lpad((coalesce(max(substring(code from 2)::int), 0) + 1)::text, 2, '0'), $1, $2, $3, false
       from harbour.facts`,
    [r.data.topic, r.data.title, r.data.content],
  );
  revalidatePath('/admin/knowledge');
}

// ---- demo -----------------------------------------------------------------

export async function resetDemo(): Promise<void> {
  await requireAdmin();
  await db().query('select harbour.reset_demo()');
  revalidatePath('/admin', 'layout');
  redirect('/admin');
}

// ---- bookings -------------------------------------------------------------

export async function setBookingStatus(form: FormData): Promise<void> {
  await requireAdmin();
  const id = str(form, 'booking_id');
  const status = str(form, 'status');
  if (!Id.safeParse(id).success || !['confirmed', 'cancelled'].includes(status)) return;
  await db().query('update harbour.bookings set status = $2 where id = $1', [id, status]);
  revalidatePath('/admin/bookings');
}
