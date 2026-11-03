-- Harbour Study Abroad — support agent demo
-- Schema for a plain Postgres (Railway). Everything lives in schema "harbour",
-- so it can share the database with n8n (which has its own "settings" table).
--
-- Who touches the database: ONLY the Next.js app, server-side.
--   * the browser never talks to the database;
--   * n8n (the agent) never talks to the database either: the app sends it the
--     context and saves what comes back.

create extension if not exists pgcrypto;
create schema if not exists harbour;

-- ---------------------------------------------------------------------------
-- settings: one row. Everything the panel can change about the agent.
-- ---------------------------------------------------------------------------
create table harbour.settings (
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
create table harbour.facts (
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
create table harbour.conversations (
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
create index conversations_last_idx on harbour.conversations (last_message_at desc);

create table harbour.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references harbour.conversations(id) on delete cascade,
  role             text not null check (role in ('visitor','agent','staff','system')),
  content          text not null,
  fact_codes       text[] not null default '{}',  -- facts the agent used
  meta             jsonb not null default '{}',   -- knew, guardrail, after_hours, fallback...
  created_at       timestamptz not null default now()
);
create index messages_conv_idx on harbour.messages (conversation_id, created_at);
create index messages_visitor_day_idx on harbour.messages (created_at) where role = 'visitor';

-- ---------------------------------------------------------------------------
-- agent_errors: every failed AI call. The panel shows unresolved ones as an alert.
-- ---------------------------------------------------------------------------
create table harbour.agent_errors (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references harbour.conversations(id) on delete cascade,
  kind             text not null check (kind in ('ai_error','invalid_output','workflow_unreachable')),
  detail           text not null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index agent_errors_open_idx on harbour.agent_errors (created_at desc) where resolved_at is null;

-- keep updated_at honest
create or replace function harbour.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger settings_touch before update on harbour.settings for each row execute function harbour.touch_updated_at();
create trigger facts_touch    before update on harbour.facts    for each row execute function harbour.touch_updated_at();
