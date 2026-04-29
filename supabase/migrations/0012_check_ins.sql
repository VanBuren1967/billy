-- Plan 5 Task 1: check_ins table for weekly athlete check-ins.

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  week_starting date not null,
  bodyweight_lbs numeric not null check (bodyweight_lbs > 0 and bodyweight_lbs < 1000),
  fatigue integer not null check (fatigue between 1 and 10),
  soreness integer not null check (soreness between 1 and 10),
  confidence integer not null check (confidence between 1 and 10),
  motivation integer not null check (motivation between 1 and 10),
  meet_readiness integer check (meet_readiness is null or meet_readiness between 1 and 10),
  pain_notes text,
  comments text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, week_starting)
);
create index check_ins_athlete_id_idx on public.check_ins(athlete_id);

create or replace function public.bump_check_ins_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger check_ins_bump_updated_at
  before update on public.check_ins
  for each row execute function public.bump_check_ins_updated_at();

alter table public.check_ins enable row level security;

create policy check_ins_athlete_select on public.check_ins
  for select using (athlete_id = public.auth_athlete_id());
create policy check_ins_athlete_insert on public.check_ins
  for insert with check (athlete_id = public.auth_athlete_id());
create policy check_ins_athlete_update on public.check_ins
  for update using (athlete_id = public.auth_athlete_id())
  with check (athlete_id = public.auth_athlete_id());
create policy check_ins_athlete_delete on public.check_ins
  for delete using (athlete_id = public.auth_athlete_id());

create policy check_ins_coach_select on public.check_ins
  for select using (athlete_id in (
    select id from public.athletes where coach_id = public.auth_coach_id()
  ));
