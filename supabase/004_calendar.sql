-- Napojení Google Kalendáře. Spusť v Supabase: SQL Editor → New snippet → Run.
-- (Je zahrnuto i v schema.sql pro nové instalace.)

-- Úkol se změnil a je potřeba ho propsat do kalendáře
alter table public.tasks add column if not exists gcal_dirty boolean not null default true;

-- Synchronizace (změna gcal_synced_at) neoznačuje úkol jako změněný ani neposouvá updated_at;
-- změna obsahu úkolu ho označí k zápisu do kalendáře.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  if new.done and not coalesce(old.done, false) then new.done_at = now(); end if;
  if not new.done then new.done_at = null; end if;

  if new.gcal_synced_at is distinct from old.gcal_synced_at then
    new.gcal_dirty = false;
  elsif (new.title, new.notes, new.due_date, new.due_time, new.deadline, new.tags, new.done)
        is distinct from
        (old.title, old.notes, old.due_date, old.due_time, old.deadline, old.tags, old.done) then
    new.gcal_dirty = true;
    new.updated_at = now();
  else
    new.updated_at = now();
  end if;
  return new;
end $$;

-- Připojený Google účet. Tokeny čte jen server (service role) – žádná pravidla pro prohlížeč.
create table if not exists public.google_accounts (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  email             text,
  refresh_token     text not null,
  access_token      text,
  access_expires_at timestamptz,
  tasks_calendar_id text,
  show_calendars    text[],          -- null = podle výběru v Google Kalendáři
  write_tasks       boolean not null default true,
  last_sync_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.google_accounts enable row level security;
