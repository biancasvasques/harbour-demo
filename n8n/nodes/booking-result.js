// n8n Code node "Booking result". After "Reserve slot" (the booking tool).
const r = $input.first().json || {};
if (r.ok) {
  return [{ json: {
    ok: true, route: 'booking_done', role: 'system',
    reply: `✅ Consultation requested for ${r.when} (Sydney time), ${r.where}. Reference ${r.ref}. ` +
           'A consultant will confirm by email. (This is a demo: no email is sent.) Is there anything else I can help you with?',
  } }];
}
const why = r.error === 'taken' || r.error === 'not_offered'
  ? 'Sorry, that time was just taken. Please pick another one.'
  : 'Sorry, we could not book that time. Please try again.';
return [{ json: { ok: true, route: 'booking_failed', role: null, reply: why } }];
