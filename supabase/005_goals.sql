-- Cíle odpracovaných hodin. Spusť v Supabase: SQL Editor → New snippet → Run.
create table if not exists public.time_goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tag        text,                                   -- null = všechen čas
  period     text not null check (period in ('day', 'week', 'month')),
  hours      numeric(6,2) not null check (hours > 0 and hours <= 744),
  workdays   int[] not null default '{1,2,3,4,5}',   -- 1 = po … 7 = ne
  created_at timestamptz not null default now()
);

alter table public.time_goals enable row level security;

drop policy if exists "own goals" on public.time_goals;
create policy "own goals" on public.time_goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
