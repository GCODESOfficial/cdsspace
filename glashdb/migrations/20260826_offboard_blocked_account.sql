-- Offboard a blocked account.
--
-- The code-side blocklist (src/lib/security/email-blocklist.ts) stops the
-- address from signing in or registering again, but it cannot reach a session
-- cookie that was already issued. This migration closes the remaining doors:
-- deactivates the row, revokes live sessions, kills outstanding invite links,
-- and deletes the face-verification biometrics.
--
-- Every statement is guarded with to_regclass / column lookups so it runs
-- cleanly on installations that do not have all of these tables yet, and every
-- statement is idempotent - re-running it is a no-op.
--
-- Keep the address list here in sync with BLOCKED_EMAILS in
-- src/lib/security/email-blocklist.ts.

do $$
declare
  blocked_emails text[] := array['johnemediong22@gmail.com'];
  member_ids uuid[];
begin
  ------------------------------------------------------------------
  -- Staff / team accounts
  ------------------------------------------------------------------
  if to_regclass('public.team_members') is not null then
    select coalesce(array_agg(id), '{}'::uuid[])
      into member_ids
      from public.team_members
     where lower(email) = any (select lower(e) from unnest(blocked_emails) e);

    update public.team_members
       set is_active = false,
           -- A live invite link would re-open the account, and the avatar is
           -- rendered across the staff dashboards.
           invite_token = null,
           invite_temp_password = null,
           avatar_url = null
     where id = any (member_ids);

    raise notice 'team_members deactivated: %', coalesce(array_length(member_ids, 1), 0);

    -- Revoke any session that is still open in a browser somewhere.
    if to_regclass('public.team_device_sessions') is not null then
      update public.team_device_sessions
         set revoked_at = now(),
             revoke_reason = 'account_blocked'
       where team_member_id = any (member_ids)
         and revoked_at is null;
    end if;

    -- Biometrics: no reason to retain them once the account is closed.
    if to_regclass('public.team_face_profiles') is not null then
      delete from public.team_face_profiles where team_member_id = any (member_ids);
    end if;
    if to_regclass('public.team_face_challenges') is not null then
      delete from public.team_face_challenges where team_member_id = any (member_ids);
    end if;
  end if;

  ------------------------------------------------------------------
  -- Sub-admin accounts
  ------------------------------------------------------------------
  if to_regclass('public.sub_admins') is not null then
    update public.sub_admins
       set is_active = false
     where lower(email) = any (select lower(e) from unnest(blocked_emails) e);
  end if;

  ------------------------------------------------------------------
  -- Client / marketer profiles
  ------------------------------------------------------------------
  if to_regclass('public.profiles') is not null
     and exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'account_status'
     ) then
    update public.profiles
       set account_status = 'closed',
           updated_at = now()
     where lower(email) = any (select lower(e) from unnest(blocked_emails) e)
       and account_status is distinct from 'closed';
  end if;

  ------------------------------------------------------------------
  -- Pending invitations addressed to the blocked address
  ------------------------------------------------------------------
  if to_regclass('public.admin_invites') is not null
     and exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'admin_invites' and column_name = 'used_at'
     ) then
    update public.admin_invites i
       set used_at = now()
     where i.used_at is null
       and exists (
         select 1 from public.sub_admins s
          where s.id = i.sub_admin_id
            and lower(s.email) = any (select lower(e) from unnest(blocked_emails) e)
       );
  end if;
end $$;
