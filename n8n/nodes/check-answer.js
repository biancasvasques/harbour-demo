// n8n Code node "Check answer" (Run Once for All Items).
//
// The model's word is not trusted. This node checks the reply in code before it
// can reach the visitor:
//   1. the reply must come in the fixed format;
//   2. every fact it cites must be one of the approved facts sent in;
//   3. a deterministic guard blocks prices, money amounts and exact dates,
//      whatever the instructions say.
// Anything that fails becomes a hand-over to a person, never a guess.
const resp = $input.first().json || {};
const approved = new Set($('Build request').first().json.approved_codes || []);

// Structured output: the answer is the JSON in the text block.
let a = null;
try {
  const txt = (resp.content || []).filter((b) => b && b.type === 'text').map((b) => b.text).join('');
  a = JSON.parse(txt);
} catch (e) {
  a = null;
}
if (resp.stop_reason === 'refusal' || resp.stop_reason === 'max_tokens') a = null;

if (!a || typeof a.reply !== 'string' || !a.reply.trim() || typeof a.knew !== 'boolean') {
  return [{ json: { ok: false, error: 'invalid_output', detail: 'The model did not return the expected format.' } }];
}

const cited = Array.isArray(a.fact_codes) ? a.fact_codes.map(String) : [];
const unknown = cited.filter((c) => !approved.has(c));

function guard(t) {
  const rules = [
    [/(A\$|AU\$|NZ\$|US\$|R\$|\$|€|£)\s?\d/i, 'price'],
    [/\b(AUD|NZD|USD|BRL|EUR|GBP|CAD)\s?\d/i, 'price'],
    [/\d[\d,.]*\s?(dollars?|reais|euros?|pounds?)\b/i, 'price'],
    [/\b\d{1,3}\s?%\s?(off|discount|scholarship)/i, 'discount'],
    [/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/, 'exact date'],
  ];
  for (const [re, why] of rules) if (re.test(t)) return why;
  return null;
}

const blocked = guard(a.reply);
let reply = a.reply.trim();
let knew = a.knew;
let needsHuman = a.needs_human === true || a.knew === false;
let reason = typeof a.reason === 'string' ? a.reason.slice(0, 300) : '';
let guardrail = null;

if (unknown.length) {
  // cited something that is not an approved fact: do not send it
  guardrail = `unapproved fact cited: ${unknown.join(', ')}`;
  knew = false;
  needsHuman = true;
  reply = '';
} else if (blocked) {
  guardrail = blocked;
  needsHuman = true;
  reply = 'I can not share prices, discounts or exact dates here, so a consultant will send you the right details in this chat.';
}

if (needsHuman && !reason) reason = guardrail ? `Guardrail: ${guardrail}` : 'The approved facts do not answer this question.';

return [{
  json: {
    ok: true,
    reply,            // empty = the app uses the hand-over message from settings
    knew,
    fact_codes: unknown.length ? [] : cited,
    needs_human: needsHuman,
    reason,
    guardrail,
    usage: resp.usage || null,
  },
}];
