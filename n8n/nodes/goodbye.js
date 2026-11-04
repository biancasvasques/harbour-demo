// n8n Code node "Goodbye + survey". The visitor said goodbye: thank them and
// open the satisfaction survey (1 to 5 stars + optional comment). Fixed text in
// the visitor's language, no AI. This is the only reply that does not end with
// a follow-up question.
const detectLang = (t) => {
  const s = String(t || '').toLowerCase();
  if (/(^|[^\p{L}])(quero|agendar|marcar|horário|horario|você|voce|obrigad[oa]|olá|ola|oi|tchau|consulta|gostaria|reunião|reuniao|abaixo|curso|quanto|posso|não|nao|sim|bom dia|boa tarde|boa noite|até|ate)(?=[^\p{L}]|$)/u.test(s)) return 'pt';
  if (/(^|[^\p{L}])(quiero|cita|hola|gracias|usted|puedo|adiós|adios|chau|hasta|cuánto|cuanto|necesito|buenos|buenas)(?=[^\p{L}]|$)/u.test(s)) return 'es';
  return 'en';
};
const lang = detectLang($input.first().json.message);
const reply = {
  en: 'Thank you so much for your time! Before you go, could you rate this conversation? It takes two seconds and helps us improve.',
  pt: 'Muito obrigado pela sua disposição! Antes de ir, pode avaliar esta conversa? Leva dois segundos e nos ajuda a melhorar.',
  es: '¡Muchas gracias por tu tiempo! Antes de irte, ¿puedes valorar esta conversación? Son dos segundos y nos ayuda a mejorar.',
}[lang];
return [{ json: { ok: true, route: 'goodbye', role: 'agent', reply, action: 'survey', intent: 'goodbye', knew: true } }];
