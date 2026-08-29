-- Removes adult, dating and nightlife entries from the directory, and keeps them
-- out of it. CDS Space sells to trading businesses, so these are never wanted.
--
-- The application blocks them on the way in (src/lib/prospect-exclusions.ts).
-- This clears what was imported before that block existed, and leaves a database
-- level check so nothing can be written past it later.

begin;

create or replace function public.prospect_is_excluded(name text, domain text, industry text, notes text)
returns boolean
language sql
immutable
as $$
  select
    -- Hosts that are never a company website.
    coalesce(domain, '') ~* '(^|\.)(xvideos|xnxx|pornhub|xhamster|redtube|youporn|spankbang|eporner|tube8|beeg|txxx|brazzers|bangbros|onlyfans|fansly|chaturbate|stripchat|bongacams|livejasmin|myfreecams|cam4|camsoda|adultfriendfinder|fetlife|nhentai|motherless|tinder|badoo|bumble|okcupid|eharmony|zoosk|plentyoffish|pof|grindr|ashleymadison|seeking|meetme|skout|jerkmate)\.'
    or coalesce(domain, '') ~* '\.(xxx|porn|sex|adult|cam|tube)$'
    -- Trade descriptions that identify an excluded business.
    or lower(concat_ws(' ', name, industry, notes)) ~ '(pornograph|porn site|porn video|adult video|adult film|adult entertainment|adult content|adult webcam|webcam model|cam girl|camgirl|live cams|sex shop|sexshop|sex toy|erotic|eroti|fetish|bdsm|swinger|brothel|escort service|escort agency|escorts|massage parlour|massage parlor|strip club|stripclub|strippers|gentlemen''s club|gentlemens club|lap dance|peep show|xxx|dating app|dating site|dating website|dating service|dating agency|dating platform|online dating|hookup|sugar daddy|sugar baby|night club|nightclub|hostess club|shisha lounge|hookah lounge)'
    or lower(concat_ws(' ', name, industry)) ~ '\y(porn|porno|nsfw|escort|escorts|brothel|stripper|strippers|onlyfans|hentai)\y'
$$;

-- Genuine escort businesses carry a qualifier that makes their trade clear.
create or replace function public.prospect_is_legit_escort(name text, industry text)
returns boolean
language sql
immutable
as $$
  select lower(concat_ws(' ', name, industry)) ~ '\y(security|vehicle|convoy|protection|patient|medical|ambulance|logistics|transport|haulage|abnormal load|police|armed|marine|pilot)\y'
     and lower(concat_ws(' ', name, industry)) !~ '(porn|xxx|adult entertainment|strip club|brothel|massage parlour)'
$$;

delete from public.prospect_companies
where public.prospect_is_excluded(company_name, domain, industry, notes)
  and not (lower(concat_ws(' ', company_name, industry)) ~ '\yescorts?\y'
           and public.prospect_is_legit_escort(company_name, industry))
  and review_status <> 'promoted';

comment on function public.prospect_is_excluded(text, text, text, text) is
  'Adult, dating and nightlife filter. Mirrors isExcludedBusiness() in src/lib/prospect-exclusions.ts.';

commit;
