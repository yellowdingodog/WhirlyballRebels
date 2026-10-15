-- =====================================================================
-- Poll votes: let admins change (insert / update / clear) anyone's vote
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- Requires public.is_admin_user() from 2026-10-09_profiles_team_division.sql
-- Existing "players manage their own vote" policies are left as-is;
-- Postgres ORs permissive policies together, so these only ADD access.
-- =====================================================================

drop policy if exists "Admins can insert any vote" on public.poll_votes;
create policy "Admins can insert any vote"
  on public.poll_votes
  for insert
  to authenticated
  with check (public.is_admin_user());

drop policy if exists "Admins can update any vote" on public.poll_votes;
create policy "Admins can update any vote"
  on public.poll_votes
  for update
  to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists "Admins can delete any vote" on public.poll_votes;
create policy "Admins can delete any vote"
  on public.poll_votes
  for delete
  to authenticated
  using (public.is_admin_user());

-- Check ------------------------------------------------------------------
-- select policyname, cmd, roles from pg_policies where tablename = 'poll_votes';
