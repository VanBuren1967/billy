-- Plan 3 — Programs subsystem RLS. Per-coach isolation enforced at the
-- database layer: even with a leaked anon key, a signed-in coach cannot
-- read or write another coach's programs.

-- Helper: returns the coaches.id for the current authenticated user, or null.
create or replace function public.auth_coach_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from public.coaches where auth_user_id = auth.uid()
$$;

-- Enable RLS.
alter table public.programs enable row level security;
alter table public.program_days enable row level security;
alter table public.program_exercises enable row level security;

-- programs: coach reads/writes own only. No DELETE policy (soft-archive only).
create policy programs_coach_select on public.programs
  for select using (coach_id = public.auth_coach_id());

create policy programs_coach_insert on public.programs
  for insert with check (coach_id = public.auth_coach_id());

create policy programs_coach_update on public.programs
  for update using (coach_id = public.auth_coach_id())
  with check (coach_id = public.auth_coach_id());

-- program_days: traverse program_id → coach_id.
create policy program_days_coach_select on public.program_days
  for select using (program_id in (
    select id from public.programs where coach_id = public.auth_coach_id()
  ));

create policy program_days_coach_insert on public.program_days
  for insert with check (program_id in (
    select id from public.programs where coach_id = public.auth_coach_id()
  ));

create policy program_days_coach_update on public.program_days
  for update
  using (program_id in (
    select id from public.programs where coach_id = public.auth_coach_id()
  ))
  with check (program_id in (
    select id from public.programs where coach_id = public.auth_coach_id()
  ));

create policy program_days_coach_delete on public.program_days
  for delete using (program_id in (
    select id from public.programs where coach_id = public.auth_coach_id()
  ));

-- program_exercises: traverse program_day_id → program_id → coach_id.
create policy program_exercises_coach_select on public.program_exercises
  for select using (program_day_id in (
    select pd.id from public.program_days pd
      join public.programs p on p.id = pd.program_id
    where p.coach_id = public.auth_coach_id()
  ));

create policy program_exercises_coach_insert on public.program_exercises
  for insert with check (program_day_id in (
    select pd.id from public.program_days pd
      join public.programs p on p.id = pd.program_id
    where p.coach_id = public.auth_coach_id()
  ));

create policy program_exercises_coach_update on public.program_exercises
  for update
  using (program_day_id in (
    select pd.id from public.program_days pd
      join public.programs p on p.id = pd.program_id
    where p.coach_id = public.auth_coach_id()
  ))
  with check (program_day_id in (
    select pd.id from public.program_days pd
      join public.programs p on p.id = pd.program_id
    where p.coach_id = public.auth_coach_id()
  ));

create policy program_exercises_coach_delete on public.program_exercises
  for delete using (program_day_id in (
    select pd.id from public.program_days pd
      join public.programs p on p.id = pd.program_id
    where p.coach_id = public.auth_coach_id()
  ));

grant execute on function public.auth_coach_id() to authenticated;
