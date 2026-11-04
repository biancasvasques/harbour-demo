// Builds the importable n8n workflow from the node files in n8n/nodes/.
//
//   node n8n/build-workflow.mjs        -> n8n/harbour-agent.workflow.json (placeholders, safe to commit)
//   node n8n/build-workflow.mjs --path <secret> --app <https://app> --key <tools secret> --out <file>
//                                      -> the file to import (holds secrets: keep it out of git)
//
// The flow on the canvas:
//
//   Webhook -> Read request -> Router ─┬─ Silent ──────────── Stay silent ───────────────┐
//                                      ├─ Goodbye ─────────── Goodbye + survey ──────────┤
//                                      ├─ Agent off ───────── Agent off message ─────────┤
//                                      ├─ Ready answer ────── Ready answer (no AI) ──────┤
//                                      ├─ Booking ─────────── Check free times ─ Offer times ┤
//                                      ├─ Confirm booking ─── Reserve slot ─ Booking result ─┤
//                                      └─ Claude ─ Build request ─ Call Claude ─ Check answer ─ Wants to book? ─┤
//                                                                    │ error                      yes → Check free times
//                                                                    └─ Describe failure ──────────────────┤
//                                                                                                    Reply to app
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const webhookPath = arg('--path') ?? 'REPLACE-WITH-SECRET-PATH';
const appUrl = (arg('--app') ?? 'https://REPLACE-WITH-APP-URL').replace(/\/$/, '');
const toolsKey = arg('--key') ?? 'REPLACE-WITH-TOOLS-SECRET';
const out = arg('--out') ?? path.join(here, 'harbour-agent.workflow.json');
const code = (f) => readFileSync(path.join(here, 'nodes', f), 'utf8');

const codeNode = (id, name, file, position) => ({
  id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { jsCode: code(file) },
});
const toolHeaders = { sendHeaders: true, headerParameters: { parameters: [{ name: 'x-harbour-key', value: toolsKey }] } };

const ROUTES = [
  ['silent', 'Silent'],
  ['goodbye', 'Goodbye'],
  ['agent_off', 'Agent off'],
  ['ready_answer', 'Ready answer'],
  ['booking', 'Booking'],
  ['confirm_booking', 'Confirm booking'],
  ['claude', 'Claude'],
];

const nodes = [
  {
    id: 'n01', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 300],
    webhookId: '6f6c2b52-6a8e-4a43-9b1e-4d2f1a7c9e10',
    parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'responseNode', options: {} },
  },
  codeNode('n02', 'Read request', 'read-request.js', [220, 300]),
  {
    id: 'n03', name: 'Router', type: 'n8n-nodes-base.switch', typeVersion: 3.2, position: [440, 300],
    parameters: {
      rules: {
        values: ROUTES.map(([value, label], i) => ({
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
            conditions: [{ id: `r${i}`, leftValue: '={{ $json.route }}', rightValue: value, operator: { type: 'string', operation: 'equals' } }],
            combinator: 'and',
          },
          renameOutput: true,
          outputKey: label,
        })),
      },
      options: {},
    },
  },
  codeNode('n04', 'Stay silent', 'stay-silent.js', [760, 0]),
  codeNode('n18', 'Goodbye + survey', 'goodbye.js', [760, -120]),
  codeNode('n05', 'Agent off message', 'agent-off.js', [760, 120]),
  codeNode('n06', 'Ready answer (no AI)', 'ready-answer.js', [760, 240]),
  {
    id: 'n07', name: 'Check free times', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1300, 360],
    onError: 'continueErrorOutput',
    parameters: { method: 'GET', url: `${appUrl}/api/tools/slots`, ...toolHeaders, options: { timeout: 10000 } },
  },
  codeNode('n08', 'Offer times', 'offer-times.js', [1520, 340]),
  {
    id: 'n09', name: 'Reserve slot', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [760, 480],
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST', url: `${appUrl}/api/tools/book`, ...toolHeaders,
      sendBody: true, specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ conversation_id: $json.conversation_id, ...$json.booking }) }}',
      options: { timeout: 10000 },
    },
  },
  codeNode('n10', 'Booking result', 'booking-result.js', [1000, 460]),
  codeNode('n11', 'Tool failure', 'tool-failure.js', [1520, 520]),
  codeNode('n12', 'Build request', 'build-request.js', [760, 680]),
  {
    id: 'n13', name: 'Call Claude', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [980, 680],
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'anthropicApi',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.payload) }}',
      options: { timeout: 25000 },
    },
    credentials: { anthropicApi: { id: 'REPLACE', name: 'Anthropic demo' } },
  },
  codeNode('n14', 'Check answer', 'check-answer.js', [1200, 660]),
  {
    id: 'n15', name: 'Wants to book?', type: 'n8n-nodes-base.if', typeVersion: 2, position: [1420, 660],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: 'b1', leftValue: '={{ $json.intent }}', rightValue: 'book_consultation', operator: { type: 'string', operation: 'equals' } }],
        combinator: 'and',
      },
      options: {},
    },
  },
  codeNode('n16', 'Describe failure', 'describe-failure.js', [1200, 840]),
  {
    id: 'n17', name: 'Reply to app', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [1800, 300],
    parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: { responseCode: 200 } },
  },
];

const to = (node) => ({ node, type: 'main', index: 0 });
const connections = {
  Webhook: { main: [[to('Read request')]] },
  'Read request': { main: [[to('Router')]] },
  Router: { main: [[to('Stay silent')], [to('Goodbye + survey')], [to('Agent off message')], [to('Ready answer (no AI)')], [to('Check free times')], [to('Reserve slot')], [to('Build request')]] },
  'Stay silent': { main: [[to('Reply to app')]] },
  'Goodbye + survey': { main: [[to('Reply to app')]] },
  'Agent off message': { main: [[to('Reply to app')]] },
  'Ready answer (no AI)': { main: [[to('Reply to app')]] },
  'Check free times': { main: [[to('Offer times')], [to('Tool failure')]] },
  'Offer times': { main: [[to('Reply to app')]] },
  'Reserve slot': { main: [[to('Booking result')], [to('Tool failure')]] },
  'Booking result': { main: [[to('Reply to app')]] },
  'Tool failure': { main: [[to('Reply to app')]] },
  'Build request': { main: [[to('Call Claude')]] },
  'Call Claude': { main: [[to('Check answer')], [to('Describe failure')]] },
  'Check answer': { main: [[to('Wants to book?')]] },
  'Wants to book?': { main: [[to('Check free times')], [to('Reply to app')]] },
  'Describe failure': { main: [[to('Reply to app')]] },
};

const workflow = {
  name: 'Harbour demo · support agent',
  nodes,
  connections,
  settings: { executionOrder: 'v1', saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' },
  pinData: {},
};

writeFileSync(out, JSON.stringify(workflow, null, 2) + '\n');
console.log(`wrote ${out} (${nodes.length} nodes)`);
