-- Panel switch to prove the failure path live: when on, the app asks the
-- workflow to call a model that does not exist, so the REAL error branch runs
-- (fallback message to the visitor + alert in the panel).
alter table harbour.settings add column simulate_ai_failure boolean not null default false;

create or replace function harbour.reset_demo() returns void
language plpgsql as $$
begin
  delete from harbour.agent_errors;
  delete from harbour.messages;
  delete from harbour.conversations;
  perform harbour.seed_demo();
  update harbour.settings set simulate_ai_failure = false where id = 1;
end $$;
