-- Plan 4 Task 1: workout_logs + set_logs tables for athlete-side logging.
-- FK to program_day_id / program_exercise_id uses ON DELETE RESTRICT —
-- once a log exists, the coach can't hard-delete the prescription;
-- archival is the only path. Athletes own their history.

create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  program_day_id uuid not null references public.program_days(id) on delete restrict,
  status text not null default 'in_progress'
    check (status in ('in_progress','completed','skipped')),
  completed_at timestamptz,
  pain_notes text,
  general_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, program_day_id)
);
create index workout_logs_athlete_id_idx on public.workout_logs(athlete_id);
create index workout_logs_program_day_id_idx on public.workout_logs(program_day_id);

create or replace function public.bump_workout_logs_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger workout_logs_bump_updated_at
  before update on public.workout_logs
  for each row execute function public.bump_workout_logs_updated_at();

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references public.workout_logs(id) on delete cascade,
  program_exercise_id uuid not null references public.program_exercises(id) on delete restrict,
  set_number integer not null check (set_number > 0),
  weight_lbs numeric,
  reps_done integer,
  rpe numeric check (rpe is null or rpe between 0 and 10),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (workout_log_id, program_exercise_id, set_number)
);
create index set_logs_workout_log_id_idx on public.set_logs(workout_log_id);
create index set_logs_program_exercise_id_idx on public.set_logs(program_exercise_id);

create or replace function public.bump_set_logs_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger set_logs_bump_updated_at
  before update on public.set_logs
  for each row execute function public.bump_set_logs_updated_at();

-- RLS: workout_logs
alter table public.workout_logs enable row level security;

create policy workout_logs_athlete_select on public.workout_logs
  for select using (athlete_id = public.auth_athlete_id());
create policy workout_logs_athlete_insert on public.workout_logs
  for insert with check (athlete_id = public.auth_athlete_id());
create policy workout_logs_athlete_update on public.workout_logs
  for update using (athlete_id = public.auth_athlete_id())
  with check (athlete_id = public.auth_athlete_id());
create policy workout_logs_athlete_delete on public.workout_logs
  for delete using (athlete_id = public.auth_athlete_id());

create policy workout_logs_coach_select on public.workout_logs
  for select using (athlete_id in (
    select id from public.athletes where coach_id = public.auth_coach_id()
  ));

-- RLS: set_logs
alter table public.set_logs enable row level security;

create policy set_logs_athlete_select on public.set_logs
  for select using (workout_log_id in (
    select id from public.workout_logs where athlete_id = public.auth_athlete_id()
  ));
create policy set_logs_athlete_insert on public.set_logs
  for insert with check (workout_log_id in (
    select id from public.workout_logs where athlete_id = public.auth_athlete_id()
  ));
create policy set_logs_athlete_update on public.set_logs
  for update using (workout_log_id in (
    select id from public.workout_logs where athlete_id = public.auth_athlete_id()
  ))
  with check (workout_log_id in (
    select id from public.workout_logs where athlete_id = public.auth_athlete_id()
  ));
create policy set_logs_athlete_delete on public.set_logs
  for delete using (workout_log_id in (
    select id from public.workout_logs where athlete_id = public.auth_athlete_id()
  ));

create policy set_logs_coach_select on public.set_logs
  for select using (workout_log_id in (
    select wl.id from public.workout_logs wl
      join public.athletes a on a.id = wl.athlete_id
    where a.coach_id = public.auth_coach_id()
  ));
