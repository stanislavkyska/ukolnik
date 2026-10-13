-- Měření času. Spusť v Supabase: SQL Editor → New snippet → Run.
-- (Je zahrnuto i v schema.sql pro nové instalace.)

create table if not exists public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default '',
  tags        text[] not null default '{}',
  task_id     uuid references public.tasks(id) on delete set null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  created_at  timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create index if not exists time_user_start_idx on public.time_entries (user_id, started_at desc);
create index if not exists time_tags_idx on public.time_entries using gin (tags);
-- nejvýš jedny běžící stopky na uživatele
create unique index if not exists time_one_running_idx on public.time_entries (user_id) where ended_at is null;

alter table public.time_entries enable row level security;

drop policy if exists "own time" on public.time_entries;
create policy "own time" on public.time_entries
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Štítky jsou společné pro úkoly i čas
create or replace view public.tag_usage with (security_invoker = true) as
  select user_id, name, count(*)::int as count, max(used_at) as last_used
  from (
    select t.user_id, tag as name, t.updated_at as used_at from public.tasks t, unnest(t.tags) as tag
    union all
    select e.user_id, tag as name, e.started_at as used_at from public.time_entries e, unnest(e.tags) as tag
  ) u
  group by user_id, name;
