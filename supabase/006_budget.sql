-- Rozpočet hodin projektu (cíl za celou dobu). Spusť v Supabase: SQL Editor → New snippet → Run.
alter table public.time_goals drop constraint if exists time_goals_period_check;
alter table public.time_goals add constraint time_goals_period_check check (period in ('day', 'week', 'month', 'project'));
alter table public.time_goals drop constraint if exists time_goals_hours_check;
alter table public.time_goals add constraint time_goals_hours_check check (hours > 0 and hours <= 9999);

-- Součet ukončených záznamů se štítkem (včetně podštítků) za celou dobu, v milisekundách
create or replace function public.tag_time_total(p_tag text) returns bigint
language sql stable security invoker as $$
  select coalesce(sum(extract(epoch from (e.ended_at - e.started_at)) * 1000), 0)::bigint
  from public.time_entries e
  where e.user_id = auth.uid()
    and e.ended_at is not null
    and exists (
      select 1 from unnest(e.tags) t
      where lower(t) = lower(p_tag) or lower(t) like lower(p_tag) || '/%'
    );
$$;
