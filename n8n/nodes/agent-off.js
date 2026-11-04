// n8n Code node "Agent off message". Fixed text, no AI.
return [{ json: {
  ok: true, route: 'agent_off', role: 'system', needs_human: true, reason: 'Agent switched off',
  reply: 'Thanks for your message! Our online assistant is switched off right now, so a consultant will reply in this chat.',
} }];
