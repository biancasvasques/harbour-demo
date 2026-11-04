// n8n Code node "Describe failure" (Run Once for All Items).
// The Claude call failed (bad key, no credit, timeout, invalid request...).
// The workflow still answers the app, with ok:false, so the app can send the
// fallback message to the visitor and raise the alert in the panel.
// n8n puts the generic text in error.message and the API's own explanation in
// error.description: keep both so the panel shows the real cause.
const j = $input.first().json || {};
const err = j.error || {};
const parts = [err.message, err.description].filter((x) => typeof x === 'string' && x.trim());
const detail = (parts.join(' | ') || JSON.stringify(err) || 'unknown error').slice(0, 500);
return [{ json: { ok: false, error: 'ai_error', detail } }];
