-- =====================================================================
-- Polls: short vote notes (20 chars) + admin-added guests
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- Requires public.is_admin_user() from 2026-10-09_profiles_team_division.sql
-- =====================================================================

-- 1) Note on a player's vote, e.g. "be there at 12" ----------------------
alter table public.poll_votes
  add column if not exists note varchar(20);

alter table public.poll_votes drop constraint if exists poll_votes_note_check;
alter table public.poll_votes
  add constraint poll_votes_note_check check (note is null or char_length(note) <= 20);


-- 2) Guests: one-off people (no account) added to a poll by an admin ----
-- poll_id is created with the same type as polls.id (uuid or bigint).
do $$
declare
  id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into id_type
  from pg_attribute a
  where a.attrelid = 'public.polls'::regclass and a.attname = 'id';

  execute format($f$
    create table if not exists public.poll_guests (
      id          uuid primary key default gen_random_uuid(),
      poll_id     %s not null references public.polls(id) on delete cascade,
      name        varchar(60) not null check (char_length(trim(name)) > 0),
      vote        text not null default 'going' check (vote in ('going','maybe','not_going')),
      note        varchar(20) check (note is null or char_length(note) <= 20),
      added_by    uuid references auth.users(id) on delete set null default auth.uid(),
      created_at  timestamptz not null default now()
    )$f$, id_type);
end $$;

create index if not exists poll_guests_poll_id_idx on public.poll_guests (poll_id);

alter table public.poll_guests enable row level security;

drop policy if exists "Signed-in users can view guests" on public.poll_guests;
create policy "Signed-in users can view guests"
  on public.poll_guests for select to authenticated
  using (true);

drop policy if exists "Admins can add guests" on public.poll_guests;
create policy "Admins can add guests"
  on public.poll_guests for insert to authenticated
  with check (public.is_admin_user());

drop policy if exists "Admins can update guests" on public.poll_guests;
create policy "Admins can update guests"
  on public.poll_guests for update to authenticated
  using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Admins can remove guests" on public.poll_guests;
create policy "Admins can remove guests"
  on public.poll_guests for delete to authenticated
  using (public.is_admin_user());

-- Check ------------------------------------------------------------------
-- select * from public.poll_guests order by created_at desc;
-- select policyname, cmd from pg_policies where tablename in ('poll_votes','poll_guests');
