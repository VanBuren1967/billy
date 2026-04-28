-- Plan 3 Task 7 follow-up: programs.updated_at column + trigger.
-- Bumped automatically on every UPDATE so listPrograms can sort by recency
-- of edit (not just creation).

alter table public.programs
  add column updated_at timestamptz not null default now();

create or replace function public.bump_programs_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger programs_bump_updated_at
  before update on public.programs
  for each row execute function public.bump_programs_updated_at();
