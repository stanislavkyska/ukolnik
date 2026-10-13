-- Deadline u úkolů. Spusť v Supabase: SQL Editor → New snippet → Run.
alter table public.tasks add column if not exists deadline date;
create index if not exists tasks_deadline_idx on public.tasks (user_id, deadline) where done = false;
