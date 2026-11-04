// n8n Code node "Build request" (document reader).
// Receives one image or PDF from the app and builds the Claude request. The output
// format is fixed here: the model extracts, it never decides. Checks and
// approval happen afterwards, in code and by a person.
const b = ($input.first().json || {}).body || {};
const img = b.image || {};
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
if (!TYPES.includes(img.media_type) || typeof img.data !== 'string' || img.data.length < 100) {
  throw new Error('invalid_input: a document is required (pdf, jpeg, png, webp or gif, base64)');
}
if (img.data.length > 5_000_000) throw new Error('invalid_input: image too large');

const num = { anyOf: [{ type: 'number' }, { type: 'null' }] };
const str = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const schema = {
  type: 'object',
  properties: {
    document_type: { anyOf: [{ type: 'string', enum: ['invoice', 'receipt', 'other'] }, { type: 'null' }] },
    supplier_name: str,
    abn: { ...str, description: 'Australian Business Number exactly as printed, or null' },
    invoice_number: str,
    invoice_date: { ...str, description: 'YYYY-MM-DD' },
    due_date: { ...str, description: 'YYYY-MM-DD, only if printed' },
    currency: { ...str, description: 'ISO code, e.g. AUD' },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { description: str, quantity: num, amount: { ...num, description: 'line total as printed' } },
        required: ['description', 'quantity', 'amount'],
        additionalProperties: false,
      },
    },
    subtotal: { ...num, description: 'amount before tax, as printed' },
    gst: { ...num, description: 'GST or tax amount, as printed' },
    total: { ...num, description: 'total payable, as printed' },
    unclear: { ...str, description: 'anything hard to read or ambiguous, in one short sentence, or null' },
  },
  required: ['document_type', 'supplier_name', 'abn', 'invoice_number', 'invoice_date', 'due_date', 'currency',
    'line_items', 'subtotal', 'gst', 'total', 'unclear'],
  additionalProperties: false,
};

const rules = [
  'You read supplier invoices and receipts for the accounts team of an education agency in Sydney.',
  'Copy values exactly as printed on the document. Do not calculate, correct or complete anything:',
  'if the GST looks wrong, copy it as printed; the team checks the maths separately.',
  'If a field is missing, cut off or not legible, return null for it. Never guess.',
  'Amounts are plain numbers without currency symbols (1,677.50 becomes 1677.5). Dates become YYYY-MM-DD.',
  'Use "unclear" to mention anything a person should double-check.',
].join('\n');

const payload = {
  model: b.simulate_failure === true ? 'harbour-simulated-failure' : 'claude-sonnet-5-5',
  max_tokens: 4096,
  system: [{ type: 'text', text: rules, cache_control: { type: 'ephemeral' } }],
  messages: [{
    role: 'user',
    content: [
      img.media_type === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: img.data } }
        : { type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } },
      { type: 'text', text: 'Extract the fields of this document.' },
    ],
  }],
  output_config: { effort: 'low', format: { type: 'json_schema', schema } },
  // if a safety classifier ever declines, the API retries on a fallback model in the same call
  fallbacks: 'default',
};

return [{ json: { payload } }];
