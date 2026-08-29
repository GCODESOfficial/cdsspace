-- Narrows the company identity key so it stops merging different companies.
--
-- The first version stripped descriptive words as well as legal forms, which
-- reduced both "Graham Holdings Co" and "Graham Corp" to "graham", and both
-- "Spire Global, Inc" and "Spire Inc" to "spire". Those are different companies.
-- Only genuine legal forms are stripped now. Holdings, Group, Global,
-- International and the rest are part of the name and stay.

begin;

create or replace function public.prospect_name_key(value text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(public.unaccent_basic(regexp_replace(coalesce(value, ''), '\s*[([][^)\]]*[)\]]\s*$', ''))),
          '\y(incorporated|corporation|company|limited|inc|corp|co|ltd|llc|llp|lp|plc|pte|pty|gmbh|ag|nv|bv|sa|sas|srl|spa|ab|as|oy|ou|aps|kk|kft|sdn|bhd|jsc|ooo|pjsc|fzco|fze|fzc|dmcc|wll|sarl|kg|oyj|asa|doo|dd|zoo|eood|ood|ik|ky)\y',
          ' ', 'g'),
        '[^[:alnum:] ]', ' ', 'g'),
      '\s+', ' ', 'g')),
    '');
$$;

-- Two entries from the same register with different registration numbers are
-- different companies however alike their names read. The importer keeps them
-- apart by qualifying the key, and this index still guarantees one row per key.
comment on function public.prospect_name_key(text) is
  'Company identity key: trailing branch qualifier dropped, accents folded, legal forms removed. Mirrored by companyNameKey() in src/lib/prospect-directory.ts.';

commit;
