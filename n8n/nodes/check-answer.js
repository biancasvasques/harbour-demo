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

// Every answer ends with a question, so the conversation never stops dead.
// The instructions ask for it; this makes sure of it, in the visitor's language.
const detectLang = (t) => {
  const s = String(t || '').toLowerCase();
  if (/(^|[^\p{L}])(quero|agendar|marcar|horário|horario|você|voce|obrigad[oa]|olá|ola|oi|tchau|consulta|gostaria|reunião|reuniao|abaixo|curso|quanto|posso|não|nao|sim|bom dia|boa tarde|boa noite|até|ate)(?=[^\p{L}]|$)/u.test(s)) return 'pt';
  if (/(^|[^\p{L}])(quiero|cita|hola|gracias|usted|puedo|adiós|adios|chau|hasta|cuánto|cuanto|necesito|buenos|buenas)(?=[^\p{L}]|$)/u.test(s)) return 'es';
  return 'en';
};
const FOLLOW_UP = {
  en: 'Is there anything else I can help you with?',
  pt: 'Posso ajudar com mais alguma coisa?',
  es: '¿Puedo ayudarte con algo más?',
};
let followUpAdded = false;
if (reply && !/[?？]\s*$/.test(reply)) {
  reply = `${reply}\n\n${FOLLOW_UP[detectLang(`${reply} ${$('Build request').first().json.message || ''}`)]}`;
  followUpAdded = true;
}

if (needsHuman && !reason) reason = guardrail ? `Guardrail: ${guardrail}` : 'The approved facts do not answer this question.';

return [{
  json: {
    ok: true,
    route: 'claude',
    role: 'agent',
    reply,            // empty = the app uses the hand-over message from settings
    knew,
    fact_codes: unknown.length ? [] : cited,
    needs_human: needsHuman,
    intent: ['question', 'book_consultation', 'talk_to_person', 'smalltalk'].includes(a.intent) ? a.intent : 'question',
    reason,
    guardrail,
    follow_up_added: followUpAdded,
    usage: resp.usage || null,
  },
}];
