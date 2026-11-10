-- =====================================================================
-- Polls: add a type (Practice / Event / Other)
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- Existing polls default to 'practice'.
-- =====================================================================

alter table public.polls
  add column if not exists poll_type text not null default 'practice';

alter table public.polls
  drop constraint if exists polls_poll_type_check;

alter table public.polls
  add constraint polls_poll_type_check
  check (poll_type in ('practice', 'event', 'other'));

-- Check ------------------------------------------------------------------
-- select poll_type, count(*) from public.polls group by poll_type;
