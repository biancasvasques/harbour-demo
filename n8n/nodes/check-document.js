// n8n Code node "Check extraction" (document reader).
// The model's word is not trusted: the reply must be the fixed format, with the
// right types. Business rules (GST, ABN, duplicates) run in the app afterwards,
// next to the database.
const resp = $input.first().json || {};
let e = null;
try {
  const txt = (resp.content || []).filter((c) => c && c.type === 'text').map((c) => c.text).join('');
  e = JSON.parse(txt);
} catch (err) {
  e = null;
}
if (resp.stop_reason === 'refusal' || resp.stop_reason === 'max_tokens') e = null;

const isNum = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));
const isStr = (v) => v === null || typeof v === 'string';
const ok = e && typeof e === 'object'
  && ['supplier_name', 'abn', 'invoice_number', 'invoice_date', 'due_date', 'currency', 'unclear'].every((k) => isStr(e[k]))
  && ['subtotal', 'gst', 'total'].every((k) => isNum(e[k]))
  && Array.isArray(e.line_items)
  && e.line_items.every((l) => l && isStr(l.description) && isNum(l.quantity) && isNum(l.amount));

if (!ok) {
  return [{ json: { ok: false, error: 'invalid_output', detail: 'The model did not return the expected invoice format.' } }];
}
const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : v);
return [{
  json: {
    ok: true,
    extracted: {
      document_type: ['invoice', 'receipt', 'other'].includes(e.document_type) ? e.document_type : null,
      supplier_name: clip(e.supplier_name, 160),
      abn: clip(e.abn, 20),
      invoice_number: clip(e.invoice_number, 60),
      invoice_date: clip(e.invoice_date, 10),
      due_date: clip(e.due_date, 10),
      currency: clip(e.currency, 3),
      line_items: e.line_items.slice(0, 50).map((l) => ({ description: clip(l.description, 200), quantity: l.quantity, amount: l.amount })),
      subtotal: e.subtotal,
      gst: e.gst,
      total: e.total,
      unclear: clip(e.unclear, 300),
    },
    usage: resp.usage || null,
  },
}];
