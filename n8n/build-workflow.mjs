// Builds the importable n8n workflow from the node files in n8n/nodes/.
//
//   node n8n/build-workflow.mjs                 -> n8n/harbour-agent.workflow.json (path placeholder, safe to commit)
//   node n8n/build-workflow.mjs --path <secret> --out <file>   -> file to import (keep out of git)
//
// The webhook path is the shared secret between the app and n8n: whoever does
// not know it cannot call the agent. It never goes into the repository.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const webhookPath = arg('--path') ?? 'REPLACE-WITH-SECRET-PATH';
const out = arg('--out') ?? path.join(here, 'harbour-agent.workflow.json');
const code = (f) => readFileSync(path.join(here, 'nodes', f), 'utf8');

const nodes = [
  {
    id: 'a1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
    webhookId: '6f6c2b52-6a8e-4a43-9b1e-4d2f1a7c9e10',
    parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'responseNode', options: {} },
  },
  {
    id: 'a2', name: 'Build request', type: 'n8n-nodes-base.code', typeVersion: 2, position: [240, 0],
    parameters: { jsCode: code('build-request.js') },
  },
  {
    id: 'a3', name: 'Call Claude', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [480, 0],
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
  {
    id: 'a4', name: 'Check answer', type: 'n8n-nodes-base.code', typeVersion: 2, position: [720, -100],
    parameters: { jsCode: code('check-answer.js') },
  },
  {
    id: 'a5', name: 'Describe failure', type: 'n8n-nodes-base.code', typeVersion: 2, position: [720, 100],
    parameters: { jsCode: code('describe-failure.js') },
  },
  {
    id: 'a6', name: 'Reply to app', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [960, 0],
    parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: { responseCode: 200 } },
  },
];

const connections = {
  Webhook: { main: [[{ node: 'Build request', type: 'main', index: 0 }]] },
  'Build request': { main: [[{ node: 'Call Claude', type: 'main', index: 0 }]] },
  'Call Claude': {
    main: [
      [{ node: 'Check answer', type: 'main', index: 0 }],
      [{ node: 'Describe failure', type: 'main', index: 0 }],
    ],
  },
  'Check answer': { main: [[{ node: 'Reply to app', type: 'main', index: 0 }]] },
  'Describe failure': { main: [[{ node: 'Reply to app', type: 'main', index: 0 }]] },
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
