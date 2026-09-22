-- CREATE workspaces have a fixed 2 GiB private storage allowance.

alter table public.create_credit_accounts
  alter column storage_limit_bytes set default 2147483648;

update public.create_credit_accounts
   set storage_limit_bytes = 2147483648,
       updated_at = now()
 where storage_limit_bytes is distinct from 2147483648;
