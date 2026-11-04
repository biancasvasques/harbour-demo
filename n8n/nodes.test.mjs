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
  const out = run('build-request.js', { body: context });
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
  const out = run('build-request.js', { body: { ...context, simulate_failure: true } });
  assert.equal(out.payload.model, 'harbour-simulated-failure');
});

test('build: refuses a request without a message', () => {
  assert.throws(() => run('build-request.js', { body: { ...context, message: '  ' } }), /invalid_input/);
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
