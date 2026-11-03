// n8n Code node "Describe failure" (Run Once for All Items).
// The Claude call failed (bad key, no credit, timeout, unknown model...).
// The workflow still answers the app, with ok:false, so the app can send the
// fallback message to the visitor and raise the alert in the panel.
const j = $input.first().json || {};
const err = j.error || {};
const detail = String(err.message || err.description || JSON.stringify(err) || 'unknown error').slice(0, 500);
return [{ json: { ok: false, error: 'ai_error', detail } }];
