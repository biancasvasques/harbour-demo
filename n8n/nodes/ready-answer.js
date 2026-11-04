// n8n Code node "Ready answer (no AI)". A menu question: reply with the approved
// fact exactly as written, then a fixed follow-up question (every answer ends
// with a question, so the conversation never stops dead). Instant and free.
const r = $input.first().json.ready;
return [{ json: {
  ok: true, route: 'ready_answer', role: 'agent', reply: `${r.content}\n\nIs there anything else you would like to know?`,
  fact_codes: [r.code], knew: true, needs_human: false, intent: 'question',
} }];
