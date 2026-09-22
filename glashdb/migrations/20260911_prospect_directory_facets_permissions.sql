begin;

-- Prospect imports can arrive through the service-role API as well as the
-- direct application pool. Give that server-only role the privileges needed
-- by the counter and facet triggers; browser roles retain no access.
grant select, insert, update, delete on public.prospect_directory_counters to service_role;
grant select, insert, update, delete on public.prospect_directory_facets to service_role;
grant select, insert, update, delete on public.prospect_reachable_companies to service_role;
grant execute on function public.prospect_bump_counter(text, bigint) to service_role;
grant execute on function public.prospect_bump_facet(text, text, text, bigint) to service_role;
grant execute on function public.prospect_refresh_reachable_company(uuid) to service_role;

commit;
