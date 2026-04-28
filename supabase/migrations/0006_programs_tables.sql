-- Plan 3 — Programs subsystem (coach side): create programs, program_days,
-- program_exercises tables. RLS policies are added in 0007 to keep that
-- migration's failing-then-passing test trivial to write.

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  athlete_id uuid references public.athletes(id) on delete set null,
  name text not null,
  block_type text not null check (block_type in ('hypertrophy','strength','peak','general')),
  start_date date,
  end_date date,
  total_weeks integer not null check (total_weeks between 1 and 52),
  notes text,
  is_template boolean not null default false,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now()
);
create index programs_coach_id_idx on public.programs(coach_id);
create index programs_athlete_id_idx on public.programs(athlete_id) where athlete_id is not null;
create index programs_is_template_idx on public.programs(is_template);

create table public.program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  week_number integer not null check (week_number > 0),
  day_number integer not null check (day_number > 0),
  name text not null,
  notes text,
  unique (program_id, week_number, day_number)
);
create index program_days_program_id_idx on public.program_days(program_id);

create table public.program_exercises (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references public.program_days(id) on delete cascade,
  position integer not null,
  name text not null,
  sets integer not null check (sets > 0),
  reps text not null,
  load_pct numeric check (load_pct is null or load_pct between 0 and 150),
  load_lbs numeric check (load_lbs is null or load_lbs >= 0),
  rpe numeric check (rpe is null or rpe between 0 and 10),
  group_label text,
  notes text
);
create index program_exercises_program_day_id_idx on public.program_exercises(program_day_id);
comment on column public.program_exercises.group_label is
  'Optional grouping label like "A", "B" for supersets/circuits. Null = standalone. Exercises in the same program_day with the same group_label form a block ordered by position.';
