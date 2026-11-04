// n8n Code node "Tool failure". A call to the app's tools failed.
const err = ($input.first().json || {}).error || {};
const detail = [err.message, err.description].filter((x) => typeof x === 'string' && x.trim()).join(' | ') || 'tool call failed';
return [{ json: { ok: false, error: 'tool_error', detail: detail.slice(0, 500) } }];
