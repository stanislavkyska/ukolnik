-- Rozpočet projektu: štítek „mm“ počítá i „mm-rd-jarosek“ (nejen „mm/rd-jarosek“)
create or replace function public.tag_time_total(p_tag text) returns bigint
language sql stable security invoker as $$
  select coalesce(sum(extract(epoch from (e.ended_at - e.started_at)) * 1000), 0)::bigint
  from public.time_entries e
  where e.user_id = auth.uid() and e.ended_at is not null
    and exists (select 1 from unnest(e.tags) t
      where lower(t) = lower(p_tag) or lower(t) like lower(p_tag) || '/%' or lower(t) like lower(p_tag) || '-%');
$$;
