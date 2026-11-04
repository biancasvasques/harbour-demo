// n8n Code node "Offer times". After "Check free times" (the slots tool).
// The reply opens the booking card in the chat; the times shown come from the
// same tool, never from the AI. Fixed text, in the visitor's language.
const count = Number(($input.first().json || {}).count || 0);
const msg = String(($('Read request').first().json || {}).message || '').toLowerCase();
const lang = /\b(quero|agendar|marcar|horário|horario|você|voce|obrigad|olá|ola|consulta|gostaria|reunião|reuniao|abaixo)\b/.test(msg) ? 'pt'
  : /\b(quiero|cita|reservar|hola|gracias|usted|puedo)\b/.test(msg) ? 'es' : 'en';

const TEXT = {
  en: { some: (n) => `Happy to help! There are ${n} free times in the next few days. Pick the one that suits you below.`,
        none: 'There are no free times in the next few days, so a consultant will contact you to find one.' },
  pt: { some: (n) => `Com prazer! Temos ${n} horários livres nos próximos dias. Escolha o melhor para você logo abaixo.`,
        none: 'Não há horários livres nos próximos dias, então um consultor vai entrar em contato para combinar.' },
  es: { some: (n) => `¡Con gusto! Hay ${n} horarios libres en los próximos días. Elige el que mejor te quede aquí abajo.`,
        none: 'No hay horarios libres en los próximos días, así que un consultor te contactará para coordinar.' },
}[lang];

if (count > 0) {
  return [{ json: { ok: true, route: 'booking_offer', role: 'agent', action: 'booking', intent: 'book_consultation', reply: TEXT.some(count) } }];
}
return [{ json: {
  ok: true, route: 'booking_offer', role: 'agent', intent: 'book_consultation', needs_human: true,
  reason: 'Wanted to book but no free times', reply: TEXT.none,
} }];
