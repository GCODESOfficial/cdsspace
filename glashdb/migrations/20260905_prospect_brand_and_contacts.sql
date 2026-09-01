-- Brand consistency, domain variants, DNS-derived contacts, and an editable
-- research brief on the prospect checklist.

begin;

alter table public.prospect_companies
  -- How the logo and naming on each social account compares with the website.
  add column if not exists brand_consistency jsonb not null default '[]'::jsonb,
  -- Whether the bare domain and the www host both serve the site. Developers
  -- routinely configure one and forget the other, which quietly loses traffic.
  add column if not exists domain_variants jsonb not null default '[]'::jsonb,
  -- Contact routes traced from the domain's own DNS records.
  add column if not exists dns_contacts jsonb not null default '[]'::jsonb;

-- The full research write-up is copied onto the checklist entry when a company
-- is promoted, so the team can edit it and add their own findings without
-- touching the researched record it came from.
alter table public.deal_prospects
  add column if not exists research_brief text;

comment on column public.deal_prospects.research_brief is
  'Editable copy of the prospect generation research, owned by the team once promoted.';

-- Undo the cross-register merges made before the identity rule was tightened.
-- A company whose country rows come from registers other than its own, with no
-- domain to corroborate the match, was two different businesses sharing a name.
delete from public.prospect_company_countries pcc
using public.prospect_companies c
where pcc.company_id = c.id
  and c.domain is null
  and c.registry_source is not null
  and pcc.source_url is not null
  and lower(pcc.country) <> lower(coalesce(c.hq_country, ''))
  and not exists (
    select 1 from public.prospect_company_countries other
    where other.company_id = c.id and other.source_url = pcc.source_url and other.is_headquarters
  )
  and pcc.source_url not like '%' || split_part(coalesce(c.source_url, 'nomatch'), '/', 3) || '%';

delete from public.prospect_company_aliases a
using public.prospect_companies c
where a.company_id = c.id
  and c.domain is null
  and c.registration_id is not null;

commit;
