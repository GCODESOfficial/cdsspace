-- Adds daily/weekly/custom recurrence cycles + custom interval (in days)
-- Safe to re-run.

alter table finance_expenditures
  drop constraint if exists finance_expenditures_recurrence_cycle_check;

alter table finance_expenditures
  add constraint finance_expenditures_recurrence_cycle_check
  check (recurrence_cycle in ('daily','weekly','monthly','quarterly','yearly','custom'));

alter table finance_expenditures
  add column if not exists custom_interval_days integer;
