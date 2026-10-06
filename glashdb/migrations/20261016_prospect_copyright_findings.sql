-- Correct research scored on a footer copyright year.
--
-- The website check read the first year after "©", so "© 1995-2026" was
-- reported as "not updated in 31 years" and cost the site 18 points (8 for a
-- two-year gap). A copyright year says nothing about a site's user flow,
-- interface design or brand consistency, so the rule has been removed. This
-- restores the companies it already marked: the finding is dropped, the points
-- are returned, and the website status, issue tags, deal score and priority are
-- derived again from the corrected score. Pain points the write-up built on the
-- copyright year go too, with the "how we help" entry paired to each.
--
-- The same correction covers a rule retired earlier: a twitter.com link was
-- read as an unmaintained footer (5 points), although twitter.com still
-- resolves to X and official share widgets use it.

with affected as (
  select c.id,
         c.website_status as old_status,
         c.website_score,
         c.issues,
         c.deal_score,
         coalesce((
           select sum(case
                        when f.value #>> '{}' ilike 'The copyright notice still reads%' then 18
                        when f.value #>> '{}' ilike 'The copyright notice%' then 8
                        else 5 end)
             from jsonb_array_elements(c.website_findings) f
            where f.value #>> '{}' ilike 'The copyright notice%'
               or f.value #>> '{}' ilike 'The site still links to twitter.com%'
         ), 0) as penalty,
         coalesce((
           select jsonb_agg(f.value order by f.ordinality)
             from jsonb_array_elements(c.website_findings) with ordinality f
            where f.value #>> '{}' not ilike 'The copyright notice%'
              and f.value #>> '{}' not ilike 'The site still links to twitter.com%'
         ), '[]'::jsonb) as findings
    from public.prospect_companies c
   where c.website_findings::text ilike '%copyright notice%'
      or c.website_findings::text ilike '%still links to twitter.com%'
),
rescored as (
  select a.*,
         least(100, coalesce(a.website_score, 0) + a.penalty) as new_score,
         case when jsonb_array_length(a.findings) = 0
              then '["No dated markup signals were detected on the homepage; confirm design quality by eye before quoting this."]'::jsonb
              else a.findings end as new_findings
    from affected a
),
restated as (
  select r.*,
         case when r.old_status in ('outdated', 'dated', 'modern')
              then case when r.new_score < 45 then 'outdated' when r.new_score < 70 then 'dated' else 'modern' end
              else r.old_status end as new_status
    from rescored r
),
final as (
  select s.*,
         array(
           select issue from unnest(coalesce(s.issues, '{}'::text[])) issue
            where issue <> 'outdated_website'
               or s.new_status = 'outdated'
               or s.new_findings::text ~* '(jQuery 1\.x|Bootstrap 2 or 3|Flash content)'
         ) as kept_issues,
         greatest(0, least(100, coalesce(s.deal_score, 0)
           + (case s.new_status when 'outdated' then 35 when 'dated' then 25 when 'modern' then 8 else 0 end)
           - (case s.old_status when 'outdated' then 35 when 'dated' then 25 when 'modern' then 8 else 0 end))) as new_deal_score
    from restated s
)
update public.prospect_companies c
   set website_findings = f.new_findings,
       website_score = f.new_score,
       website_status = f.new_status,
       issues = array(
         select issue from unnest(f.kept_issues) issue
          where issue <> 'poorly_designed_website'
             or f.new_score < 55
             or f.new_findings::text ~* '(nested tables|Deprecated HTML|Presentational HTML)'
       ),
       deal_score = f.new_deal_score,
       priority = case when f.new_deal_score >= 70 then 'high' when f.new_deal_score >= 45 then 'medium' else 'low' end,
       updated_at = now()
  from final f
 where c.id = f.id;

-- Pain points that argue from the copyright year or the twitter.com link,
-- and the paired "how we
-- help" entry at the same position when the two lists line up.
with flagged as (
  select c.id,
         c.pain_points,
         c.how_we_help,
         array(
           select (p.ordinality - 1)::int
             from jsonb_array_elements(c.pain_points) with ordinality p
            where p.value #>> '{}' ~* '(copyright|not been (updated|touched|refreshed|maintained) (in|for) (over |more than )?[0-9]+ years|twitter(\.com)? (instead of|rather than) x|twitter instead of x)'
         ) as drop_at
    from public.prospect_companies c
   where jsonb_typeof(c.pain_points) = 'array'
     and c.pain_points::text ~* '(copyright|not been (updated|touched|refreshed|maintained) (in|for) (over |more than )?[0-9]+ years|twitter(\.com)? (instead of|rather than) x|twitter instead of x)'
)
update public.prospect_companies c
   set pain_points = coalesce((
         select jsonb_agg(p.value order by p.ordinality)
           from jsonb_array_elements(f.pain_points) with ordinality p
          where not ((p.ordinality - 1)::int = any(f.drop_at))
       ), '[]'::jsonb),
       how_we_help = case
         when jsonb_typeof(f.how_we_help) = 'array'
              and jsonb_array_length(f.how_we_help) = jsonb_array_length(f.pain_points)
         then coalesce((
           select jsonb_agg(h.value order by h.ordinality)
             from jsonb_array_elements(f.how_we_help) with ordinality h
            where not ((h.ordinality - 1)::int = any(f.drop_at))
         ), '[]'::jsonb)
         else c.how_we_help end,
       updated_at = now()
  from flagged f
 where c.id = f.id;
