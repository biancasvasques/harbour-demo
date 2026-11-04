'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BOOKING_START_TEXT, QUICK_QUESTIONS } from '@/lib/quick';

type Message = {
  role: 'visitor' | 'agent' | 'staff' | 'system';
  content: string;
  created_at: string;
  action?: string | null;
  author?: string | null;
};
type Slot = { start: string; label: string; day: string };

const TOKEN_KEY = 'harbour-chat-token';
const POLL_MS = 4000;

function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function writeToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode: still works, just not across reloads */ }
}
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function Avatar({ role, name }: { role: Message['role']; name?: string | null }) {
  if (role === 'agent') return <span className="avatar ai" aria-hidden>⚓</span>;
  if (role === 'staff') return <span className="avatar staff" aria-hidden>{(name ?? 'H').slice(0, 1).toUpperCase()}</span>;
  return null;
}

// ---------------------------------------------------------------------------
// Booking card: times come from the server (business hours, Sydney), the
// reservation is made by code. The AI only opens this card.
// ---------------------------------------------------------------------------
function BookingCard({ token, onBooked, onClose }: {
  token: string | null;
  onBooked: (token: string) => void;
  onClose: () => void;
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [day, setDay] = useState<string>('');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [mode, setMode] = useState<'online' | 'office'>('online');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSlots = useCallback(async () => {
    const res = await fetch('/api/booking', { cache: 'no-store' });
    const data = (await res.json()) as { slots: Slot[] };
    setSlots(data.slots);
    setDay((d) => d || data.slots[0]?.day || '');
  }, []);
  useEffect(() => { void loadSlots(); }, [loadSlots]);

  const days = slots ? [...new Set(slots.map((s) => s.day))] : [];

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!slot || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...(token ? { token } : {}), slot: slot.start, mode, name, email }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setError(data.error ?? 'Could not book that time. Please try again.');
        if (res.status === 409) { setSlot(null); await loadSlots(); }
        return;
      }
      onBooked(data.token);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card booking" onSubmit={confirm}>
      <div className="card-head">
        <div>
          <strong>Book a free consultation</strong>
          <span>30 minutes · Sydney time</span>
        </div>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
      </div>

      {!slots && <div className="skeleton" />}
      {slots && slots.length === 0 && <p className="muted">No times available in the next few days. A consultant will contact you.</p>}

      {slots && slots.length > 0 && (
        <>
          <div className="seg" role="tablist" aria-label="Day">
            {days.map((d) => (
              <button key={d} type="button" role="tab" aria-selected={d === day}
                className={d === day ? 'on' : ''} onClick={() => { setDay(d); setSlot(null); }}>{d}</button>
            ))}
          </div>
          <div className="slots">
            {slots.filter((s) => s.day === day).map((s) => (
              <button key={s.start} type="button" className={`slot ${slot?.start === s.start ? 'on' : ''}`}
                onClick={() => setSlot(s)}>{s.label}</button>
            ))}
          </div>

          <div className="seg small" role="radiogroup" aria-label="Where">
            <button type="button" role="radio" aria-checked={mode === 'online'} className={mode === 'online' ? 'on' : ''}
              onClick={() => setMode('online')}>💻 Online</button>
            <button type="button" role="radio" aria-checked={mode === 'office'} className={mode === 'office' ? 'on' : ''}
              onClick={() => setMode('office')}>🏢 At the office</button>
          </div>

          {slot && (
            <div className="fields reveal">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" required minLength={2} maxLength={80} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for the confirmation" aria-label="Email" type="email" required maxLength={120} />
            </div>
          )}

          {error && <p className="error-inline" role="alert">{error}</p>}

          <button className="primary wide" type="submit" disabled={!slot || busy || name.trim().length < 2 || !email.includes('@')}>
            {busy ? 'Booking…' : slot ? `Confirm ${slot.day}, ${slot.label}` : 'Choose a time'}
          </button>
        </>
      )}
    </form>
  );
}

export default function Chat() {
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState('bot');
  const [visitorName, setVisitorName] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (t: string) => {
    try {
      const res = await fetch(`/api/chat?token=${encodeURIComponent(t)}`, { cache: 'no-store' });
      const data = (await res.json()) as { status?: string; visitor_name?: string | null; messages: Message[] };
      setMessages(data.messages);
      if (data.status) setStatus(data.status);
      setVisitorName(data.visitor_name ?? null);
    } catch { /* next poll retries */ }
  }, []);

  useEffect(() => {
    const t = readToken();
    if (t) { setToken(t); void load(t); }
  }, [load]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => void load(token), POLL_MS);
    return () => clearInterval(id);
  }, [token, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending, bookingOpen]);

  const booked = messages.some((m) => m.role === 'system' && m.content.startsWith('✅'));

  async function sendText(text: string) {
    if (!text || sending) return;
    setError(null);
    setSending(true);
    setDraft('');
    setMessages((m) => [...m, { role: 'visitor', content: text, created_at: new Date().toISOString() }]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(token ? { token, message: text } : { message: text }),
      });
      const data = (await res.json()) as { token?: string; error?: string; messages?: Message[] };
      if (data.token && data.token !== token) { setToken(data.token); writeToken(data.token); }
      if (!res.ok) { setError(data.error ?? 'Something went wrong. Please try again.'); setDraft(text); }
      if (data.messages?.some((m) => m.action === 'booking')) setBookingOpen(true);
      const t = data.token ?? token;
      if (t) await load(t);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setDraft(text);
      setMessages((m) => m.slice(0, -1));
    } finally {
      setSending(false);
    }
  }

  function send(e: FormEvent) {
    e.preventDefault();
    void sendText(draft.trim());
  }

  async function onBooked(t: string) {
    if (t !== token) { setToken(t); writeToken(t); }
    setBookingOpen(false);
    await load(t);
  }

  function newChat() {
    writeToken(null);
    setToken(null);
    setMessages([]);
    setStatus('bot');
    setVisitorName(null);
    setError(null);
    setBookingOpen(false);
  }

  const human = status === 'human';

  return (
    <div className="shell">
      <div className="chat">
        <header className="chat-head">
          <div className="brand">
            <span className="logo" aria-hidden>⚓</span>
            <div>
              <strong>Harbour Study Abroad</strong>
              <span className="sub">
                <i className={`dot ${human ? 'staff' : ''}`} />
                {human ? 'You are chatting with our team' : 'AI assistant · answers only from approved information'}
              </span>
            </div>
          </div>
          {messages.length > 0 && <button type="button" className="ghost" onClick={newChat}>New chat</button>}
        </header>

        <main className="chat-body" aria-live="polite">
          {messages.length === 0 && (
            <div className="welcome reveal">
              <span className="welcome-icon" aria-hidden>⚓</span>
              <p className="welcome-title">Hi! I&apos;m the Harbour assistant.</p>
              <p className="welcome-sub">Ask me about courses, destinations and documents, or book a free 30-minute consultation.</p>
              <div className="chips">
                <button type="button" className="chip strong" onClick={() => void sendText(BOOKING_START_TEXT)}>📅 Book a free consultation</button>
                {QUICK_QUESTIONS.map(({ question }) => (
                  <button key={question} type="button" className="chip" onClick={() => void sendText(question)}>{question}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            if (m.role === 'system') {
              const ok = m.content.startsWith('✅');
              return <div key={i} className={`notice reveal ${ok ? 'success' : ''}`}>{m.content}</div>;
            }
            const mine = m.role === 'visitor';
            const who = mine ? (visitorName ? `${visitorName} (you)` : 'You') : m.role === 'agent' ? 'Harbour assistant' : `${m.author ?? 'Harbour team'} · Harbour team`;
            return (
              <div key={i} className={`row reveal ${mine ? 'mine' : 'theirs'}`}>
                {!mine && <Avatar role={m.role} name={m.author} />}
                <div className="stack">
                  <span className="meta">
                    {who}
                    {m.role === 'agent' && <em className="badge">AI</em>}
                    <span className="time">{time(m.created_at)}</span>
                  </span>
                  <div className={`bubble ${m.role}`}>{m.content}</div>
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="row theirs reveal">
              <Avatar role="agent" />
              <div className="stack">
                <span className="meta">Harbour assistant <em className="badge">AI</em></span>
                <div className="bubble agent typing" aria-label="The assistant is typing"><span /><span /><span /></div>
              </div>
            </div>
          )}

          {bookingOpen && !booked && (
            <div className="reveal">
              <BookingCard token={token} onBooked={(t) => void onBooked(t)} onClose={() => setBookingOpen(false)} />
            </div>
          )}
          <div ref={endRef} />
        </main>

        {error && <div className="error" role="alert">{error}</div>}

        <form className="chat-input" onSubmit={send}>
          {!booked && !bookingOpen && (
            <button type="button" className="book-btn" onClick={() => void sendText(BOOKING_START_TEXT)} disabled={sending} aria-label="Book a consultation" title="Book a consultation">📅</button>
          )}
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type your message…"
            maxLength={1000} aria-label="Your message" disabled={sending} />
          <button type="submit" className="send" disabled={sending || !draft.trim()} aria-label="Send">➤</button>
        </form>
        <p className="disclaimer">Demo with an invented company · please don&apos;t share personal data</p>
      </div>
    </div>
  );
}
