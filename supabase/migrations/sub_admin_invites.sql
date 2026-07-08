-- One-time invite tokens used to auto-fill a new sub-admin's credentials on
-- the /admin/login page. A raw random token is emailed / copied to the new
-- sub-admin; we store only its SHA-256 hash so a leaked database dump can't
-- replay the link. The invite is single-use and expires after 7 days.
--
-- Why we need this table even though `sub_admins` already holds the email
-- and (plaintext) password: we don't want the password ever appearing in a
-- URL, referrer header, or browser history. The token in the URL is
-- meaningless on its own - the server exchanges it for the credentials
-- exactly once, then marks it used.

create table if not exists public.sub_admin_invites (
    id              uuid primary key default gen_random_uuid(),
    sub_admin_id    uuid not null references public.sub_admins(id) on delete cascade,
    token_hash      text not null unique,
    expires_at      timestamptz not null,
    used_at         timestamptz,
    created_at      timestamptz not null default now()
);

create index if not exists sub_admin_invites_sub_admin_id_idx
    on public.sub_admin_invites (sub_admin_id);

-- Lock the table down. All reads/writes must go through server routes that
-- use the service role key. Anon clients must not be able to list or fetch
-- any invite, hashed or otherwise.
alter table public.sub_admin_invites enable row level security;

drop policy if exists "sub_admin_invites_service_role_only" on public.sub_admin_invites;
create policy "sub_admin_invites_service_role_only"
    on public.sub_admin_invites
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');
