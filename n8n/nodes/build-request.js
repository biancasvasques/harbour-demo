// n8n Code node "Build request" (Run Once for All Items).
//
// Only reached on the "claude" route. Receives the context the app sent (the
// agent never reads the database) and builds the Claude request. The reply format is FIXED here, in code, not in
// the editable instructions: editing the instructions in the panel can change
// the tone, never the contract the code checks afterwards.
const body = $input.first().json || {};

function text(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

const instructions = text(body.instructions, 20000);
const message = text(body.message, 2000).trim();
const facts = Array.isArray(body.facts) ? body.facts.slice(0, 200) : [];
const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

if (!instructions || !message) {
  throw new Error('invalid_input: instructions and message are required');
}

// Only facts the app marked as approved arrive here. Each one has a short code
// the model must cite; the next node checks every code against this list.
const approvedCodes = [];
const factLines = [];
for (const f of facts) {
  const code = text(f && f.code, 10);
  const content = text(f && f.content, 2000);
  if (!/^F\d{2,3}$/.test(code) || !content) continue;
  approvedCodes.push(code);
  factLines.push(`[${code}] ${text(f.title, 200)}: ${content}`);
}

const ROLE = { visitor: 'Visitor', agent: 'Assistant', staff: 'Harbour staff' };
const transcript = history
  .filter((m) => m && ROLE[m.role])
  .map((m) => `${ROLE[m.role]}: ${text(m.content, 2000)}`)
  .join('\n');

const rules = [
  '## Approved facts',
  'These are the ONLY things you may state as true about Harbour Study Abroad.',
  'Cite the code of every fact you use in fact_codes. If no fact answers the',
  'question, set knew to false and do not guess. Greetings and small talk need',
  'no fact.',
  '',
  factLines.join('\n') || '(no approved facts)',
].join('\n');

// The reply format, enforced by the API (structured outputs): the response is
// always valid JSON matching this schema. (Forced tool_choice is rejected by
// Claude Sonnet 5.5, so structured outputs is the supported way to get it.)
const replySchema = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'The message shown to the visitor.' },
    knew: {
      type: 'boolean',
      description: 'true only if the approved facts answer the question (or it is a greeting). false if a person must answer.',
    },
    fact_codes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Codes of the approved facts used, e.g. ["F07"]. Empty for greetings.',
    },
    needs_human: {
      type: 'boolean',
      description: 'true if a consultant must follow up (the facts do not answer, a quote, a complaint). Booking a consultation is NOT a reason.',
    },
    intent: {
      type: 'string',
      enum: ['question', 'book_consultation', 'talk_to_person', 'smalltalk'],
      description: 'book_consultation when the visitor wants to book, schedule or meet a consultant (the booking form then opens).',
    },
    reason: { type: 'string', description: 'Short internal note for the team when needs_human is true, otherwise empty.' },
  },
  required: ['reply', 'knew', 'fact_codes', 'needs_human', 'intent', 'reason'],
  additionalProperties: false,
};

const payload = {
  // "Simulate AI failure" in the panel sends a model that does not exist, so the
  // demo exercises the REAL error path of the workflow, not a fake one.
  model: body.simulate_failure === true ? 'harbour-simulated-failure' : 'claude-sonnet-5-5',
  max_tokens: 4096,  // room for adaptive thinking + the short JSON reply
  system: [
    { type: 'text', text: instructions, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: rules, cache_control: { type: 'ephemeral' } },
  ],
  messages: [
    {
      role: 'user',
      content:
        (transcript ? `Conversation so far:\n${transcript}\n\n` : '') +
        `New message from the visitor:\n<visitor_message>\n${message}\n</visitor_message>`,
    },
  ],
  // low effort: short support replies from a fixed fact list, latency matters
  output_config: { effort: 'low', format: { type: 'json_schema', schema: replySchema } },
};

return [{ json: { payload, approved_codes: approvedCodes } }];
