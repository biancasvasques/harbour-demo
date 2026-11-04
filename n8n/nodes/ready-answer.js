// n8n Code node "Ready answer (no AI)". A menu question: reply with the approved
// fact exactly as written. Instant, free, and it can never be wrong.
const r = $input.first().json.ready;
return [{ json: {
  ok: true, route: 'ready_answer', role: 'agent', reply: r.content,
  fact_codes: [r.code], knew: true, needs_human: false, intent: 'question',
} }];
