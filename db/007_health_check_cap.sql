-- The public test link (/api/health?agent=1) calls Claude, so it gets its own
-- small daily cap. One row per AI check, nothing else stored.
create table harbour.health_checks (
  id bigserial primary key,
  created_at timestamptz not null default now()
);
