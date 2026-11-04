'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

type Message = { role: 'visitor' | 'agent' | 'staff' | 'system'; content: string; created_at: string };

const TOKEN_KEY = 'harbour-chat-token';
const POLL_MS = 4000;

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function writeToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the chat still works, it just won't survive a reload */
  }
}

const WHO: Record<Message['role'], string> = {
  visitor: 'You',
  agent: 'Harbour assistant',
  staff: 'Harbour team',
  system: 'Harbour',
};

export default function Chat() {
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<string>('bot');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (t: string) => {
    try {
      const res = await fetch(`/api/chat?token=${encodeURIComponent(t)}`, { cache: 'no-store' });
      const data = (await res.json()) as { status?: string; messages: Message[] };
      setMessages(data.messages);
      if (data.status) setStatus(data.status);
    } catch {
      /* keep what is on screen; the next poll retries */
    }
  }, []);

  // restore the conversation after a reload
  useEffect(() => {
    const t = readToken();
    if (t) {
      setToken(t);
      void load(t);
    }
  }, [load]);

  // poll so replies typed by the team show up without a refresh
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => void load(token), POLL_MS);
    return () => clearInterval(id);
  }, [token, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
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
      const data = (await res.json()) as { token?: string; status?: string; error?: string };
      if (data.token && data.token !== token) {
        setToken(data.token);
        writeToken(data.token);
      }
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        setDraft(text);
      }
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

  function newChat() {
    writeToken(null);
    setToken(null);
    setMessages([]);
    setStatus('bot');
    setError(null);
  }

  const withPerson = status === 'human' || status === 'needs_human';

  return (
    <div className="chat">
      <header className="chat-head">
        <div className="brand">
          <span className="logo" aria-hidden>⚓</span>
          <div>
            <strong>Harbour Study Abroad</strong>
            <span className="sub">{withPerson ? 'A consultant will reply here' : 'Online assistant · answers from approved information'}</span>
          </div>
        </div>
        {messages.length > 0 && (
          <button type="button" className="ghost" onClick={newChat}>New chat</button>
        )}
      </header>

      <main className="chat-body" aria-live="polite">
        {messages.length === 0 && (
          <div className="welcome">
            <p className="welcome-title">Hi! How can we help with your study plans?</p>
            <p className="welcome-sub">Ask about courses, destinations, documents or accommodation.</p>
            <div className="chips">
              {['How long are English courses?', 'Which cities do you work with?', 'Do you charge for your service?'].map((q) => (
                <button key={q} type="button" className="chip" onClick={() => setDraft(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'system' ? (
            <div key={i} className="notice">{m.content}</div>
          ) : (
            <div key={i} className={`row ${m.role === 'visitor' ? 'mine' : 'theirs'}`}>
              <div className={`bubble ${m.role}`}>
                {m.role !== 'visitor' && <span className="who">{WHO[m.role]}</span>}
                {m.content}
              </div>
            </div>
          ),
        )}

        {sending && (
          <div className="row theirs">
            <div className="bubble agent typing" aria-label="The assistant is typing">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </main>

      {error && <div className="error" role="alert">{error}</div>}

      <form className="chat-input" onSubmit={send}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type your message…"
          maxLength={1000}
          aria-label="Your message"
          disabled={sending}
        />
        <button type="submit" disabled={sending || !draft.trim()}>{sending ? '…' : 'Send'}</button>
      </form>
      <p className="disclaimer">Demo with an invented company. Please don&apos;t share personal data.</p>
    </div>
  );
}
