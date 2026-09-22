begin;

-- Facet maintenance is an internal write path. Keep browser database roles
-- from invoking maintenance helpers directly even though table RLS is also on.
revoke execute on function public.prospect_bump_counter(text, bigint) from public, anon, authenticated;
revoke execute on function public.prospect_bump_facet(text, text, text, bigint) from public, anon, authenticated;
revoke execute on function public.prospect_refresh_reachable_company(uuid) from public, anon, authenticated;
grant execute on function public.prospect_bump_counter(text, bigint) to service_role;
grant execute on function public.prospect_bump_facet(text, text, text, bigint) to service_role;
grant execute on function public.prospect_refresh_reachable_company(uuid) to service_role;

commit;
