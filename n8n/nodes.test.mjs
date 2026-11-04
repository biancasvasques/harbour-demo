// Runs the n8n Code node files outside n8n, with fake $input / $(), so the
// logic that guards the agent is tested before it is imported.
//   node --test n8n/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
function run(file, input, others = {}) {
  const fn = new Function('$input', '$', readFileSync(path.join(here, 'nodes', file), 'utf8'));
  const $input = { first: () => ({ json: input }) };
  const $ = (name) => ({ first: () => ({ json: others[name] }) });
  return fn($input, $)[0].json;
}

const context = {
  instructions: 'You are the assistant of Harbour Study Abroad.',
  message: 'How long are English courses?',
  facts: [
    { code: 'F07', title: 'English course length', content: 'English courses start from 4 weeks.' },
    { code: 'XX', title: 'bad code', content: 'ignored' },
  ],
  history: [{ role: 'visitor', content: 'Hi' }, { role: 'agent', content: 'Hello!' }],
};
// structured output: the model's JSON arrives as the text block
const toolReply = (input) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ reason: '', ...input }) }] });
const built = { approved_codes: ['F07'] };

test('build: only well-formed fact codes reach the model, format is forced', () => {
  const out = run('build-request.js', context);
  assert.deepEqual(out.approved_codes, ['F07']);
  assert.equal(out.payload.model, 'claude-sonnet-5-5');
  assert.equal(out.payload.tool_choice, undefined); // forced tool use is a 400 on Sonnet 5.5
  assert.equal(out.payload.output_config.format.type, 'json_schema');
  assert.deepEqual(out.payload.output_config.format.schema.required, ['reply', 'knew', 'fact_codes', 'needs_human', 'intent', 'reason']);
  assert.match(out.payload.system[1].text, /\[F07\]/);
  assert.doesNotMatch(out.payload.system[1].text, /ignored/);
  assert.equal(out.payload.system[0].cache_control.type, 'ephemeral');
  assert.match(out.payload.messages[0].content, /Visitor: Hi/);
});

test('build: simulate_failure sends a model that does not exist', () => {
  const out = run('build-request.js', { ...context, simulate_failure: true });
  assert.equal(out.payload.model, 'harbour-simulated-failure');
});

test('build: refuses a request without a message', () => {
  assert.throws(() => run('build-request.js', { ...context, message: '  ' }), /invalid_input/);
});

test('check: answer based on an approved fact passes', () => {
  const out = run('check-answer.js', toolReply({ reply: 'Courses start from 4 weeks.', knew: true, fact_codes: ['F07'], needs_human: false }), { 'Build request': built });
  assert.equal(out.ok, true);
  assert.equal(out.needs_human, false);
  assert.deepEqual(out.fact_codes, ['F07']);
  assert.equal(out.guardrail, null);
});

test('check: booking intent passes through, unknown intents become question', () => {
  const ok = run('check-answer.js', toolReply({ reply: 'Pick a time below.', knew: true, fact_codes: [], needs_human: false, intent: 'book_consultation' }), { 'Build request': built });
  assert.equal(ok.intent, 'book_consultation');
  const odd = run('check-answer.js', toolReply({ reply: 'Hi!', knew: true, fact_codes: [], needs_human: false, intent: 'whatever' }), { 'Build request': built });
  assert.equal(odd.intent, 'question');
});

test('check: "I do not know" becomes needs_human', () => {
  const out = run('check-answer.js', toolReply({ reply: 'I am not sure.', knew: false, fact_codes: [], needs_human: false }), { 'Build request': built });
  assert.equal(out.needs_human, true);
  assert.match(out.reason, /do not answer/);
});

test('check: citing a fact that is not approved is blocked', () => {
  const out = run('check-answer.js', toolReply({ reply: 'You get a 20 percent scholarship.', knew: true, fact_codes: ['F21'], needs_human: false }), { 'Build request': built });
  assert.equal(out.reply, '');
  assert.equal(out.knew, false);
  assert.equal(out.needs_human, true);
  assert.match(out.guardrail, /F21/);
});

test('check: prices and exact dates never reach the visitor', () => {
  for (const reply of ['It costs A$350 per week.', 'About 4,000 dollars.', 'Starts on 12/01/2027.', 'AUD 1200 total', 'You get 20% off']) {
    const out = run('check-answer.js', toolReply({ reply, knew: true, fact_codes: ['F07'], needs_human: false }), { 'Build request': built });
    assert.notEqual(out.reply, reply, reply);
    assert.equal(out.needs_human, true, reply);
    assert.ok(out.guardrail, reply);
  }
});

test('check: a broken reply format is reported, not sent', () => {
  const out = run('check-answer.js', { content: [{ type: 'text', text: 'hello' }] }, { 'Build request': built });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'invalid_output');
});

test('failure: an API error becomes ok:false for the app, with the real cause', () => {
  const out = run('describe-failure.js', { error: { message: 'Bad request - please check your parameters', description: 'tool_choice: type "tool" is not supported for this model.' } });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'ai_error');
  assert.match(out.detail, /Bad request/);
  assert.match(out.detail, /not supported/);
});

test('check: a truncated or refused answer is not sent', () => {
  for (const stop_reason of ['max_tokens', 'refusal']) {
    const out = run('check-answer.js', { ...toolReply({ reply: 'ok', knew: true, fact_codes: [], needs_human: false }), stop_reason }, { 'Build request': built });
    assert.equal(out.ok, false, stop_reason);
  }
});

// ---------------- routing (no AI) ----------------
const req = (over) => ({ body: { kind: 'message', conversation_id: 'c1', status: 'bot', agent_enabled: true,
  instructions: 'x', facts: [{ code: 'F07', title: 't', content: 'English courses start from 4 weeks.' }],
  quick: [{ question: 'How long are English courses?', code: 'F07' }], history: [], message: 'hello', ...over } });

test('router: a person took over -> silent, even if asked to book', () => {
  assert.equal(run('read-request.js', req({ status: 'human', message: 'book a meeting' })).route, 'silent');
});
test('router: agent switched off -> agent_off', () => {
  assert.equal(run('read-request.js', req({ agent_enabled: false })).route, 'agent_off');
});
test('router: booking words go to booking without AI (EN and PT)', () => {
  for (const m of ["I'd like to book a free consultation", 'Can I schedule a call?', 'quero agendar']) {
    assert.equal(run('read-request.js', req({ message: m })).route, 'booking', m);
  }
});
test('router: a menu question gets the ready answer, without AI', () => {
  const out = run('read-request.js', req({ message: 'how long are english courses?' }));
  assert.equal(out.route, 'ready_answer');
  assert.equal(out.ready.code, 'F07');
  const ans = run('ready-answer.js', out);
  assert.ok(ans.reply.startsWith('English courses start from 4 weeks.\n\n'));
  assert.deepEqual(ans.fact_codes, ['F07']);
});
test('router: free text goes to Claude', () => {
  assert.equal(run('read-request.js', req({ message: 'Do you help with health insurance?' })).route, 'claude');
});
test('router: booking confirmation is validated', () => {
  const ok = run('read-request.js', { body: { kind: 'booking_confirm', conversation_id: 'c1', booking: { slot: '2026-11-06T03:00:00.000Z', mode: 'online', name: 'Ana', email: 'a@b.co' } } });
  assert.equal(ok.route, 'confirm_booking');
  assert.throws(() => run('read-request.js', { body: { kind: 'booking_confirm', conversation_id: 'c1', booking: { slot: 'x' } } }), /invalid_input/);
});
test('offer times: opens the card when there are free times, hands over when none', () => {
  const rr = { 'Read request': { message: 'I want to book' } };
  const some = run('offer-times.js', { count: 7 }, rr);
  assert.equal(some.action, 'booking');
  assert.match(some.reply, /7 free times/);
  const none = run('offer-times.js', { count: 0 }, rr);
  assert.equal(none.action, undefined);
  assert.equal(none.needs_human, true);
});
test('offer times: answers in the visitor\'s language', () => {
  assert.match(run('offer-times.js', { count: 3 }, { 'Read request': { message: 'quero agendar uma consulta' } }).reply, /horários livres/);
  assert.match(run('offer-times.js', { count: 3 }, { 'Read request': { message: 'quiero reservar una cita' } }).reply, /horarios libres/);
});

test('booking result: confirmation with reference, or a clear "taken" message', () => {
  const done = run('booking-result.js', { ok: true, ref: 'HB-1234', when: 'Fri, 6 Nov, 2:00 pm', where: 'online (video call)' });
  assert.equal(done.route, 'booking_done');
  assert.match(done.reply, /HB-1234/);
  const taken = run('booking-result.js', { ok: false, error: 'taken' });
  assert.equal(taken.route, 'booking_failed');
  assert.match(taken.reply, /just taken/);
});

// --- follow-up question and goodbye (demo review, Nov) ---
const readReq = (message, extra = {}) => run('read-request.js', { body: { message, status: 'bot', agent_enabled: true, instructions: 'x', facts: [], quick: [], ...extra } });

test('goodbye: tchau / bye / adiós take the goodbye route, ordinary text does not', () => {
  for (const m of ['tchau', 'Obrigada, tchau!', 'bye', 'Thanks, goodbye', 'adiós', 'até logo']) assert.equal(readReq(m).route, 'goodbye', m);
  for (const m of ['How long are courses?', 'byebye-free question about Bayern', 'I want to book']) assert.notEqual(readReq(m).route, 'goodbye', m);
  assert.equal(readReq('tchau', { status: 'human' }).route, 'silent');
});

test('goodbye: thanks in the visitor language and opens the survey, no question needed', () => {
  const pt = run('goodbye.js', { message: 'obrigada, tchau' });
  assert.equal(pt.action, 'survey');
  assert.match(pt.reply, /Muito obrigado pela sua disposição/);
  assert.match(run('goodbye.js', { message: 'bye' }).reply, /^Thank you/);
  assert.match(run('goodbye.js', { message: 'adiós' }).reply, /Muchas gracias/);
});

test('check: a reply without a question gets one, in the visitor language', () => {
  const en = run('check-answer.js', toolReply({ reply: 'English courses start from 4 weeks.', knew: true, fact_codes: ['F07'], needs_human: false, intent: 'question' }), { 'Build request': { ...built, message: 'How long?' } });
  assert.match(en.reply, /4 weeks\.\n\nIs there anything else I can help you with\?$/);
  assert.equal(en.follow_up_added, true);
  const pt = run('check-answer.js', toolReply({ reply: 'Os cursos começam com 4 semanas.', knew: true, fact_codes: ['F07'], needs_human: false, intent: 'question' }), { 'Build request': { ...built, message: 'quanto tempo dura o curso?' } });
  assert.match(pt.reply, /Posso ajudar com mais alguma coisa\?$/);
  const already = run('check-answer.js', toolReply({ reply: 'They start from 4 weeks. Which city interests you?', knew: true, fact_codes: ['F07'], needs_human: false, intent: 'question' }), { 'Build request': built });
  assert.equal(already.follow_up_added, false);
});

test('ready answer, offer and booking confirmation end with a question', () => {
  assert.match(run('ready-answer.js', { ready: { code: 'F07', content: 'From 4 weeks.' } }).reply, /\?$/);
  assert.match(run('offer-times.js', { count: 5 }, { 'Read request': { message: 'quero agendar' } }).reply, /Qual fica melhor/);
  assert.match(run('booking-result.js', { ok: true, when: 'Mon 10am', where: 'online', ref: 'HB-1' }).reply, /\?$/);
});
