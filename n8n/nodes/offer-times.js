// n8n Code node "Offer times". After "Check free times" (the slots tool).
// The reply opens the booking card in the chat; the times shown come from the
// same tool, never from the AI.
const count = Number(($input.first().json || {}).count || 0);
if (count > 0) {
  return [{ json: {
    ok: true, route: 'booking_offer', role: 'agent', action: 'booking', intent: 'book_consultation',
    reply: `Happy to help! There are ${count} free times in the next few days. Pick the one that suits you below.`,
  } }];
}
return [{ json: {
  ok: true, route: 'booking_offer', role: 'agent', intent: 'book_consultation', needs_human: true,
  reason: 'Wanted to book but no free times', reply: 'There are no free times in the next few days, so a consultant will contact you to find one.',
} }];
