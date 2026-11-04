import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// One demo login for the team panel. The password and the signing secret live
// in env vars only (PANEL_PASSWORD, PANEL_SECRET). The cookie holds an expiry
// and an HMAC of it, nothing else.
const COOKIE = 'harbour_panel';
const HOURS = 12;

function secret(): string {
  const s = process.env.PANEL_SECRET ?? '';
  if (s.length < 24) throw new Error('PANEL_SECRET is not set');
  return s;
}
const sign = (v: string) => createHmac('sha256', secret()).update(v).digest('hex');

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passwordMatches(input: string): boolean {
  const real = process.env.PANEL_PASSWORD ?? '';
  return real.length >= 8 && same(input, real);
}

export async function startSession(): Promise<void> {
  const exp = String(Date.now() + HOURS * 3600_000);
  (await cookies()).set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: HOURS * 3600,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const v = (await cookies()).get(COOKIE)?.value ?? '';
  const [exp, sig] = v.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  try { return same(sig, sign(exp)); } catch { return false; }
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect('/admin/login');
}
