-- Úkolník – schéma databáze. Spusť v Supabase: SQL Editor → New query → Run.

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 500),
  notes        text not null default '',
  due_date     date,
  due_time     time,
  tags         text[] not null default '{}',
  important    boolean not null default false,
  done         boolean not null default false,
  done_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- připraveno pro synchronizaci s Google Kalendářem (krok 3)
  gcal_event_id text,
  gcal_etag     text,
  gcal_synced_at timestamptz
);

create index if not exists tasks_user_open_idx on public.tasks (user_id, done, due_date);
create index if not exists tasks_tags_idx on public.tasks using gin (tags);

-- updated_at se nastavuje samo
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  if new.done and not coalesce(old.done, false) then new.done_at = now(); end if;
  if not new.done then new.done_at = null; end if;
  return new;
end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- Každý vidí a mění jen své úkoly
alter table public.tasks enable row level security;

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


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
