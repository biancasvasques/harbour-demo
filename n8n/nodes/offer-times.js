// n8n Code node "Offer times". After "Check free times" (the slots tool).
// The reply opens the booking card in the chat; the times shown come from the
// same tool, never from the AI. Fixed text, in the visitor's language.
const count = Number(($input.first().json || {}).count || 0);
const msg = String(($('Read request').first().json || {}).message || '').toLowerCase();
const detectLang = (t) => {
  const s = String(t || '').toLowerCase();
  if (/(^|[^\p{L}])(quero|agendar|marcar|horário|horario|você|voce|obrigad[oa]|olá|ola|oi|tchau|consulta|gostaria|reunião|reuniao|abaixo|curso|quanto|posso|não|nao|sim|bom dia|boa tarde|boa noite|até|ate)(?=[^\p{L}]|$)/u.test(s)) return 'pt';
  if (/(^|[^\p{L}])(quiero|cita|hola|gracias|usted|puedo|adiós|adios|chau|hasta|cuánto|cuanto|necesito|buenos|buenas)(?=[^\p{L}]|$)/u.test(s)) return 'es';
  return 'en';
};
const lang = detectLang(msg);

const TEXT = {
  en: { some: (n) => `Happy to help! There are ${n} free times in the next few days. Which one suits you best? Pick it below.`,
        none: 'There are no free times in the next few days, so a consultant will contact you to find one. Is there anything else I can help you with meanwhile?' },
  pt: { some: (n) => `Com prazer! Temos ${n} horários livres nos próximos dias. Qual fica melhor para você? É só escolher logo abaixo.`,
        none: 'Não há horários livres nos próximos dias, então um consultor vai entrar em contato para combinar. Posso ajudar com mais alguma coisa enquanto isso?' },
  es: { some: (n) => `¡Con gusto! Hay ${n} horarios libres en los próximos días. ¿Cuál te queda mejor? Elígelo aquí abajo.`,
        none: 'No hay horarios libres en los próximos días, así que un consultor te contactará para coordinar. ¿Puedo ayudarte con algo más mientras tanto?' },
}[lang];

if (count > 0) {
  return [{ json: { ok: true, route: 'booking_offer', role: 'agent', action: 'booking', intent: 'book_consultation', reply: TEXT.some(count) } }];
}
return [{ json: {
  ok: true, route: 'booking_offer', role: 'agent', intent: 'book_consultation', needs_human: true,
  reason: 'Wanted to book but no free times', reply: TEXT.none,
} }];
