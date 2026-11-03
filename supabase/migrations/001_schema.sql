-- Harbour Study Abroad — support agent demo
-- Schema. Apply on an EMPTY Supabase project.
--
-- Who touches what:
--   * anon (browser)      : nothing. The public chat talks only to /api/chat.
--   * /api/chat and n8n   : service_role (bypasses RLS, server-side only).
--   * authenticated (demo staff login): reads everything, edits settings,
--     facts and conversation status, writes staff replies, resets the demo.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- settings: one row. Everything the panel can change about the agent.
-- ---------------------------------------------------------------------------
create table public.settings (
  id                 int primary key default 1 check (id = 1),
  agent_enabled      boolean not null default true,
  instructions       text not null,
  timezone           text not null default 'Australia/Sydney',
  -- ISO weekday (1 = Monday ... 7 = Sunday) -> ["HH:MM","HH:MM"]. Missing day = closed.
  business_hours     jsonb not null,
  after_hours_notice text not null,
  fallback_message   text not null,
  handoff_message    text not null,
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- facts: the ONLY source the agent may state as true. Only approved facts are
-- sent to the model, and the code checks every fact code the model cites.
-- ---------------------------------------------------------------------------
create table public.facts (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,           -- short id the model cites, e.g. F07
  topic       text not null,
  title       text not null,
  content     text not null,
  approved    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- conversations
--   bot          : the agent answers
--   needs_human  : the agent did not know (or the AI failed); waiting for staff
--   human        : staff took over; the agent stays silent
--   closed       : finished
-- ---------------------------------------------------------------------------
create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  visitor_token    uuid not null default gen_random_uuid() unique, -- secret held by the browser
  visitor_name     text,
  status           text not null default 'bot'
                   check (status in ('bot','needs_human','human','closed')),
  status_reason    text,
  has_error        boolean not null default false,
  visitor_messages int not null default 0,
  last_message_at  timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index conversations_last_idx on public.conversations (last_message_at desc);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  role             text not null check (role in ('visitor','agent','staff','system')),
  content          text not null,
  fact_codes       text[] not null default '{}',  -- facts the agent used
  meta             jsonb not null default '{}',   -- knew, guardrail, after_hours, fallback...
  created_at       timestamptz not null default now()
);
create index messages_conv_idx on public.messages (conversation_id, created_at);
create index messages_visitor_day_idx on public.messages (created_at) where role = 'visitor';

-- ---------------------------------------------------------------------------
-- agent_errors: every failed AI call. The panel shows unresolved ones as an alert.
-- ---------------------------------------------------------------------------
create table public.agent_errors (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references public.conversations(id) on delete cascade,
  kind             text not null check (kind in ('ai_error','invalid_output','workflow_unreachable')),
  detail           text not null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index agent_errors_open_idx on public.agent_errors (created_at desc) where resolved_at is null;

-- ---------------------------------------------------------------------------
-- RLS: on everywhere. anon gets nothing. authenticated = the demo staff user.
-- ---------------------------------------------------------------------------
alter table public.settings      enable row level security;
alter table public.facts         enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.agent_errors  enable row level security;

revoke all on public.settings, public.facts, public.conversations, public.messages, public.agent_errors from anon;

create policy staff_read_settings  on public.settings      for select to authenticated using (true);
create policy staff_edit_settings  on public.settings      for update to authenticated using (true) with check (true);

create policy staff_read_facts     on public.facts         for select to authenticated using (true);
create policy staff_add_facts      on public.facts         for insert to authenticated with check (true);
create policy staff_edit_facts     on public.facts         for update to authenticated using (true) with check (true);

create policy staff_read_convs     on public.conversations for select to authenticated using (true);
create policy staff_edit_convs     on public.conversations for update to authenticated using (true) with check (true);

create policy staff_read_msgs      on public.messages      for select to authenticated using (true);
create policy staff_reply          on public.messages      for insert to authenticated with check (role = 'staff');

create policy staff_read_errors    on public.agent_errors  for select to authenticated using (true);
create policy staff_resolve_errors on public.agent_errors  for update to authenticated using (true) with check (true);

-- the panel updates in real time
alter publication supabase_realtime add table public.conversations, public.messages, public.agent_errors;

-- keep updated_at honest
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();
create trigger facts_touch    before update on public.facts    for each row execute function public.touch_updated_at();
