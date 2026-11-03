// Stand-in for the n8n workflow, for local tests of /api/chat only.
// The reply depends on keywords in the visitor message.
import http from 'node:http';
http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const ctx = JSON.parse(b);
    const m = ctx.message.toLowerCase();
    let out;
    if (ctx.simulate_failure || m.includes('crash')) out = { ok: false, error: 'ai_error', detail: 'simulated: model not found' };
    else if (m.includes('scholarship')) out = { ok: true, reply: "I don't have that information.", knew: false, fact_codes: [], needs_human: true, reason: 'Not in approved facts' };
    else if (m.includes('price')) out = { ok: true, reply: 'I can not share prices here.', knew: true, fact_codes: [], needs_human: true, reason: 'Guardrail: price', guardrail: 'price' };
    else out = { ok: true, reply: 'English courses start from 4 weeks.', knew: true, fact_codes: ['F07'], needs_human: false, reason: '' };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(out));
  });
}).listen(Number(process.env.PORT || 5799));
