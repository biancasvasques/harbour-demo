-- A failing tool (slots or booking) is reported as 'tool_error'. The original
-- check did not list it, so the alert insert itself failed and the visitor got
-- a 500 instead of the fallback. Allow it.
alter table harbour.agent_errors drop constraint if exists agent_errors_kind_check;
alter table harbour.agent_errors
  add constraint agent_errors_kind_check
  check (kind in ('ai_error', 'invalid_output', 'tool_error', 'workflow_unreachable'));
