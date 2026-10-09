-- =====================================================================
-- Profiles: add Team Name + Division, and let admins edit any profile
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =====================================================================

-- 1) New columns -------------------------------------------------------
alter table public.profiles
  add column if not exists team_name varchar(50),
  add column if not exists division  char(1);

-- Division must be A, B, C, D, or blank (NULL)
alter table public.profiles drop constraint if exists profiles_division_check;
alter table public.profiles
  add constraint profiles_division_check
  check (division is null or division in ('A','B','C','D'));


-- 2) Helper: is the current user an admin? ----------------------------
-- SECURITY DEFINER so policies on profiles can call it without
-- recursing into profiles' own RLS.
create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_admin_user() to authenticated;


-- 3) RLS: admins can update any profile --------------------------------
-- (Existing policies that let users read/update their own row are left as-is.)
drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());


-- 4) Guard: only admins can grant admin or set team/division -----------
-- Without this, a self-update policy would let any player flip their own
-- is_admin to TRUE from the browser console.
create or replace function public.profiles_guard_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SQL Editor (no JWT) or service role: allow everything
  if auth.role() is null or auth.role() = 'service_role' or public.is_admin_user() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Sign-up: players may pick their own division; nothing else privileged
    new.is_admin  := false;
    new.team_name := null;
  else
    new.is_admin  := old.is_admin;
    new.team_name := old.team_name;
    new.division  := old.division;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_admin_fields on public.profiles;
create trigger profiles_guard_admin_fields
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_admin_fields();


-- 5) Check ---------------------------------------------------------------
-- select id, real_name, is_admin, team_name, division from public.profiles order by real_name;
