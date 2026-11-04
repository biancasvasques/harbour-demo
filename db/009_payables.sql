-- Accounts payable: supplier invoices read by the AI, checked by code and
-- approved by a person. Only approved invoices count as costs.

create table harbour.payables (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('sample', 'upload', 'seed')),
  sample_key      text,
  image_data      text,                       -- uploads only: a downscaled JPEG data URL
  status          text not null default 'review' check (status in ('review', 'approved', 'rejected')),
  extracted       jsonb not null default '{}', -- exactly what the AI returned
  checks          jsonb not null default '[]', -- results of the code checks
  supplier        text,
  abn             text,
  invoice_number  text,
  invoice_date    date,
  due_date        date,
  subtotal_cents  int,
  gst_cents       int,
  total_cents     int,
  edited          boolean not null default false,
  decision_note   text,
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index payables_status_idx on harbour.payables (status, created_at desc);

-- one row per AI read, for the daily cost cap
create table harbour.document_reads (
  id         bigserial primary key,
  created_at timestamptz not null default now()
);

-- An invoice that was already approved last month, so the duplicate check has
-- something real to catch when the same OfficeHub invoice comes in again.
create or replace function harbour.seed_payables() returns void
language sql as $$
  insert into harbour.payables (source, sample_key, status, supplier, abn, invoice_number, invoice_date, due_date,
                                subtotal_cents, gst_cents, total_cents, decided_at, decision_note, extracted)
  values ('seed', 'officehub', 'approved', 'OfficeHub Supplies', '31864452323', 'OH-2291', date '2026-10-15', date '2026-11-14',
          30300, 3030, 33330, now() - interval '12 days', 'Approved by Alex',
          '{"line_items":[{"description":"A4 copy paper (ream)","quantity":10,"amount":65},{"description":"Printer toner cartridge","quantity":2,"amount":178},{"description":"Student welcome folders","quantity":50,"amount":60}]}'::jsonb);
$$;

create or replace function harbour.reset_demo() returns void
language plpgsql as $$
begin
  delete from harbour.bookings;
  delete from harbour.agent_errors;
  delete from harbour.messages;
  delete from harbour.conversations;
  delete from harbour.payables;
  perform harbour.seed_demo();
  perform harbour.seed_payables();
  update harbour.settings
     set simulate_ai_failure = false,
         instructions = harbour.default_instructions(),
         handoff_message = harbour.default_handoff()
   where id = 1;
end $$;

select harbour.seed_payables();
