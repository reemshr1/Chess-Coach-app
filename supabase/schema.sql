-- Rank Up — database setup for Supabase.
-- Paste all of this into Supabase → SQL Editor → New query, and click Run.
-- Safe to run again: it only creates what is missing and refreshes the access rules.

-- The coach: one account, claimed by the first sign-in on a fresh install.
create table if not exists public.coach (
  one boolean primary key default true check (one),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.coach enable row level security;
drop policy if exists "anyone signed in can see who the coach is" on public.coach;
create policy "anyone signed in can see who the coach is" on public.coach
  for select to authenticated using (true);
drop policy if exists "the first account can become the coach" on public.coach;
create policy "the first account can become the coach" on public.coach
  for insert to authenticated with check (user_id = auth.uid());

create or replace function public.is_coach() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.coach where user_id = auth.uid()) $$;

-- Every record is one JSON document in a collection, the same shape the app already uses:
--   data/users/<coach id>/...      the coach's records (students, settings, assignments, games)
--   portal/<user id>               a student's or parent's link to the coach (their invite code)
--   portal/<user id>/view/...      what the coach shares with that student or parent
--   portal/<user id>/inbox/...     changes the student or parent sends to the coach
create table if not exists public.docs (
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (col, id)
);
alter table public.docs enable row level security;
alter table public.docs replica identity full;

drop policy if exists "the coach can do everything" on public.docs;
create policy "the coach can do everything" on public.docs
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

drop policy if exists "students and parents read their own pages" on public.docs;
create policy "students and parents read their own pages" on public.docs
  for select to authenticated using (
    (col = 'portal' and id = auth.uid()::text)
    or col = 'portal/' || auth.uid()::text || '/view'
    or col = 'portal/' || auth.uid()::text || '/inbox');

drop policy if exists "students and parents add their link and messages" on public.docs;
create policy "students and parents add their link and messages" on public.docs
  for insert to authenticated with check (
    (col = 'portal' and id = auth.uid()::text)
    or col = 'portal/' || auth.uid()::text || '/inbox');

drop policy if exists "students and parents update their link and messages" on public.docs;
create policy "students and parents update their link and messages" on public.docs
  for update to authenticated
  using ((col = 'portal' and id = auth.uid()::text) or col = 'portal/' || auth.uid()::text || '/inbox')
  with check ((col = 'portal' and id = auth.uid()::text) or col = 'portal/' || auth.uid()::text || '/inbox');

drop policy if exists "students and parents remove their messages" on public.docs;
create policy "students and parents remove their messages" on public.docs
  for delete to authenticated using (col = 'portal/' || auth.uid()::text || '/inbox');

-- Live updates, so changes appear on other devices without reloading.
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;
