begin;

-- Revenue models are planned month by month, so each one carries a monthly
-- target alongside its annual one. The two are linked in the UI (monthly x 12)
-- but stored separately, so an uneven ramp can be recorded without the annual
-- figure being forced to a clean multiple.

alter table public.executive_revenue_models
  add column if not exists target_monthly_value numeric(16,2) not null default 0;

-- Existing rows keep their annual figure as the source of truth; derive an
-- even monthly split for them so the new field is never misleadingly zero.
update public.executive_revenue_models
   set target_monthly_value = round(target_annual_value / 12.0, 2)
 where target_monthly_value = 0
   and target_annual_value > 0;

comment on column public.executive_revenue_models.target_monthly_value is
  'Monthly revenue target for this model. Usually the annual target divided by twelve, but editable on its own for a phased ramp.';

commit;
