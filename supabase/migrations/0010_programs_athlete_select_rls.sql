-- Plan 3b — Programs subsystem RLS extension for athletes. Athletes can
-- SELECT their own assigned programs (and the days/exercises under them).
-- No INSERT/UPDATE/DELETE for athletes; the viewer is read-only.

create or replace function public.auth_athlete_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from public.athletes where auth_user_id = auth.uid()
$$;

grant execute on function public.auth_athlete_id() to authenticated;

-- programs: athlete reads their own assigned program(s) only. Templates excluded.
create policy programs_athlete_select on public.programs
  for select using (
    athlete_id = public.auth_athlete_id() and is_template = false
  );

create policy program_days_athlete_select on public.program_days
  for select using (program_id in (
    select id from public.programs
    where athlete_id = public.auth_athlete_id() and is_template = false
  ));

create policy program_exercises_athlete_select on public.program_exercises
  for select using (program_day_id in (
    select pd.id from public.program_days pd
      join public.programs p on p.id = pd.program_id
    where p.athlete_id = public.auth_athlete_id() and p.is_template = false
  ));
