// n8n Code node "Read request" (Run Once for All Items).
// Validates what the app sent and decides the ROUTE with plain rules (no AI).
// The "Router" box right after this one branches on the route, so the
// decisions are visible on the canvas.
//   silent          a person took over: the agent does not answer
//   agent_off       the agent is switched off in the panel
//   confirm_booking the visitor confirmed the booking form
//   booking         the visitor asked to book (keywords, no AI needed)
//   ready_answer    a menu question with a ready, approved answer (no AI)
//   claude          free text: the only route that calls Claude
const b = ($input.first().json || {}).body || {};
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const conversation_id = text(b.conversation_id, 64);

if (b.kind === 'booking_confirm') {
  const k = b.booking || {};
  if (!conversation_id || !k.slot || !k.name || !k.email || !['online', 'office'].includes(k.mode)) {
    throw new Error('invalid_input: booking fields missing');
  }
  return [{ json: { route: 'confirm_booking', conversation_id, booking: { slot: k.slot, mode: k.mode, name: text(k.name, 80), email: text(k.email, 120) } } }];
}

const message = text(b.message, 2000).trim();
if (!message) throw new Error('invalid_input: message is required');

const facts = Array.isArray(b.facts) ? b.facts : [];
const quick = Array.isArray(b.quick) ? b.quick : [];
const base = {
  conversation_id,
  message,
  instructions: text(b.instructions, 20000),
  facts,
  history: Array.isArray(b.history) ? b.history.slice(-10) : [],
  simulate_failure: b.simulate_failure === true,
};

let route = 'claude';
let ready = null;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
const hit = quick.find((q) => norm(q.question) === norm(message));

if (b.status === 'human') route = 'silent';
else if (b.agent_enabled === false) route = 'agent_off';
else if (/\b(book|booking|schedule|appointment|agendar|agendamento|marcar|reservar)\b/i.test(message)) route = 'booking';
else if (hit) {
  const fact = facts.find((f) => f.code === hit.code);
  if (fact) { route = 'ready_answer'; ready = { code: fact.code, content: fact.content }; }
}

return [{ json: { route, ready, ...base } }];
