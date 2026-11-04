'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BOOKING_START_TEXT, QUICK_QUESTIONS } from '@/lib/quick';
import { Anchor, Arrow, Building, Calendar, Check, Close, Send, Star, Video } from './icons';

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
  if (role === 'agent') return <span className="avatar ai" aria-hidden><Anchor size={16} /></span>;
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
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Close size={14} /></button>
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
              onClick={() => setMode('online')}><Video size={15} /> Online</button>
            <button type="button" role="radio" aria-checked={mode === 'office'} className={mode === 'office' ? 'on' : ''}
              onClick={() => setMode('office')}><Building size={15} /> At the office</button>
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

// ---------------------------------------------------------------------------
// Satisfaction survey: opened by the "Goodbye" route of the workflow.
// ---------------------------------------------------------------------------
const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

function SurveyCard({ token, rating, onRated }: { token: string | null; rating: number | null; onRated: (r: number) => void }) {
  const [hover, setHover] = useState(0);
  const [picked, setPicked] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rating) {
    return (
      <div className="card survey done">
        <div className="stars static" aria-label={`You rated ${rating} out of 5`}>
          {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={20} filled={n <= rating} />)}
        </div>
        <p className="survey-title">Thank you for your feedback!</p>
        <p className="survey-sub">You can close this window or start a new chat any time.</p>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!picked || !token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, rating: picked, comment: comment.trim() || undefined }),
      });
      if (!res.ok) throw new Error();
      onRated(picked);
    } catch {
      setError('Could not send your rating. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const shown = hover || picked;
  return (
    <form className="card survey" onSubmit={submit}>
      <p className="survey-title">How was this conversation?</p>
      <div className="stars" role="radiogroup" aria-label="Rating from 1 to 5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={picked === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={n <= shown ? 'on' : ''} onMouseEnter={() => setHover(n)} onClick={() => setPicked(n)}>
            <Star filled={n <= shown} />
          </button>
        ))}
      </div>
      <p className="survey-sub" aria-live="polite">{shown ? RATING_LABELS[shown] : 'Tap a star to rate'}</p>
      {picked > 0 && (
        <>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={2}
            placeholder="Anything we could do better? (optional)" aria-label="Comment (optional)" />
          {error && <p className="field-error" role="alert">{error}</p>}
          <button type="submit" className="cta" disabled={busy}>{busy ? 'Sending…' : 'Send rating'}</button>
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
  const [rating, setRating] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (t: string) => {
    try {
      const res = await fetch(`/api/chat?token=${encodeURIComponent(t)}`, { cache: 'no-store' });
      const data = (await res.json()) as { status?: string; visitor_name?: string | null; rating?: number | null; messages: Message[] };
      setMessages(data.messages);
      if (data.status) setStatus(data.status);
      setVisitorName(data.visitor_name ?? null);
      setRating(data.rating ?? null);
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
  }, [messages, sending, bookingOpen, rating]);

  const booked = messages.some((m) => m.role === 'system' && m.content.startsWith('✅'));
  // the survey shows when the latest thing the assistant did was the goodbye
  const surveyAt = messages.map((m) => m.action).lastIndexOf('survey');
  const lastVisitorAt = messages.map((m) => m.role).lastIndexOf('visitor');
  const showSurvey = surveyAt > -1 && surveyAt > lastVisitorAt;

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
    setRating(null);
  }

  const human = status === 'human';

  return (
    <div className="shell">
      <div className="chat">
        <header className="chat-head">
          <div className="brand">
            <span className="logo" aria-hidden><Anchor size={22} /></span>
            <div>
              <strong>Harbour Study Abroad</strong>
              <span className="sub">
                <i className={`dot ${human ? 'staff' : ''}`} />
                {human ? 'You are chatting with our team' : 'AI assistant · online now'}
              </span>
            </div>
          </div>
          {messages.length > 0 && <button type="button" className="ghost" onClick={newChat}>New chat</button>}
        </header>

        <main className="chat-body" aria-live="polite">
          {messages.length === 0 && (
            <div className="welcome reveal">
              <span className="welcome-icon" aria-hidden><Anchor size={28} /></span>
              <p className="welcome-title">Hi! I&apos;m the Harbour assistant.</p>
              <p className="welcome-sub">Ask about courses, destinations and documents, or book a free 30-minute consultation.</p>
              <ul className="trust" aria-label="How this assistant works">
                <li><Check /> Approved answers only</li>
                <li><Check /> A real person when needed</li>
              </ul>
              <button type="button" className="cta" onClick={() => void sendText(BOOKING_START_TEXT)}>
                <Calendar /> Book a free consultation
              </button>
              <p className="chips-label">Or ask a quick question</p>
              <div className="chips">
                {QUICK_QUESTIONS.map(({ question }) => (
                  <button key={question} type="button" className="chip" onClick={() => void sendText(question)}>
                    <span>{question}</span><Arrow />
                  </button>
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

          {bookingOpen && (
            <div className="reveal">
              <BookingCard token={token} onBooked={(t) => void onBooked(t)} onClose={() => setBookingOpen(false)} />
            </div>
          )}
          {showSurvey && !sending && (
            <div className="reveal">
              <SurveyCard token={token} rating={rating} onRated={setRating} />
            </div>
          )}
          <div ref={endRef} />
        </main>

        {error && <div className="error" role="alert">{error}</div>}

        <form className="chat-input" onSubmit={send}>
          {messages.length > 0 && !booked && !bookingOpen && (
            <button type="button" className="book-btn" onClick={() => void sendText(BOOKING_START_TEXT)} disabled={sending} aria-label="Book a consultation" title="Book a consultation"><Calendar /></button>
          )}
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type your message…"
            maxLength={1000} aria-label="Your message" disabled={sending} />
          <button type="submit" className="send" disabled={sending || !draft.trim()} aria-label="Send"><Send /></button>
        </form>
        <p className="disclaimer">Please don&apos;t share personal data</p>
      </div>
    </div>
  );
}
