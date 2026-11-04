// Builds the importable n8n workflow for the invoice reader.
//
//   node n8n/build-doc-workflow.mjs        -> n8n/harbour-documents.workflow.json (placeholders, safe to commit)
//   node n8n/build-doc-workflow.mjs --path <secret> --out <file>   -> the file to import (keep out of git)
//
//   Webhook -> Build request -> Call Claude (vision) -> Check extraction -> Reply to app
//                                    │ error
//                                    └─ Describe failure ───────────────────┘
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const webhookPath = arg('--path') ?? 'REPLACE-WITH-SECRET-PATH';
const out = arg('--out') ?? path.join(here, 'harbour-documents.workflow.json');
const code = (f) => readFileSync(path.join(here, 'nodes', f), 'utf8');
const codeNode = (id, name, file, position) => ({
  id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { jsCode: code(file) },
});

const nodes = [
  {
    id: 'd01', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 300],
    webhookId: '0b8f5c1e-2d44-4f6a-9c3e-7a1d5e9b2c40',
    parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'responseNode', options: { rawBody: false } },
  },
  codeNode('d02', 'Build request', 'build-doc-request.js', [240, 300]),
  {
    id: 'd03', name: 'Call Claude (vision)', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [480, 300],
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'anthropicApi',
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'anthropic-version', value: '2023-06-01' },
        { name: 'anthropic-beta', value: 'server-side-fallback-2026-07-01' },
      ] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.payload) }}',
      options: { timeout: 45000 },
    },
    credentials: { anthropicApi: { id: 'REPLACE', name: 'Anthropic demo' } },
  },
  codeNode('d04', 'Check extraction', 'check-document.js', [720, 280]),
  codeNode('d05', 'Describe failure', 'describe-failure.js', [720, 460]),
  {
    id: 'd06', name: 'Reply to app', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [960, 300],
    parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: { responseCode: 200 } },
  },
];

const to = (node) => ({ node, type: 'main', index: 0 });
const connections = {
  Webhook: { main: [[to('Build request')]] },
  'Build request': { main: [[to('Call Claude (vision)')]] },
  'Call Claude (vision)': { main: [[to('Check extraction')], [to('Describe failure')]] },
  'Check extraction': { main: [[to('Reply to app')]] },
  'Describe failure': { main: [[to('Reply to app')]] },
};

const workflow = {
  name: 'Harbour demo · invoice reader',
  nodes,
  connections,
  settings: { executionOrder: 'v1', saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' },
  pinData: {},
};
writeFileSync(out, JSON.stringify(workflow, null, 2) + '\n');
console.log(`wrote ${out} (${nodes.length} nodes)`);
