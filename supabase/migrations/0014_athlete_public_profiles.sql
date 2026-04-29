-- Plan 7a: athlete_public_profiles table for public athlete bios.
-- One profile per athlete (optional). Coach approves before publication.

create table public.athlete_public_profiles (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null unique references public.athletes(id) on delete cascade,
  slug text not null unique,
  headline text not null,
  bio text not null,
  photo_url text,
  recent_meet_results jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  published_at timestamptz,
  coach_approved_by uuid references public.coaches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index athlete_public_profiles_published_idx on public.athlete_public_profiles(is_published) where is_published = true;

create or replace function public.bump_app_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger app_bump_updated_at
  before update on public.athlete_public_profiles
  for each row execute function public.bump_app_updated_at();

alter table public.athlete_public_profiles enable row level security;

-- Athlete: full CRUD on own profile.
create policy app_athlete_select on public.athlete_public_profiles
  for select using (athlete_id = public.auth_athlete_id());
create policy app_athlete_insert on public.athlete_public_profiles
  for insert with check (athlete_id = public.auth_athlete_id());
create policy app_athlete_update on public.athlete_public_profiles
  for update using (athlete_id = public.auth_athlete_id())
  with check (athlete_id = public.auth_athlete_id());
create policy app_athlete_delete on public.athlete_public_profiles
  for delete using (athlete_id = public.auth_athlete_id());

-- Coach: SELECT all own athletes' profiles, UPDATE only is_published / published_at /
-- coach_approved_by (not bio/etc — that's the athlete's content).
create policy app_coach_select on public.athlete_public_profiles
  for select using (athlete_id in (
    select id from public.athletes where coach_id = public.auth_coach_id()
  ));
create policy app_coach_update on public.athlete_public_profiles
  for update using (athlete_id in (
    select id from public.athletes where coach_id = public.auth_coach_id()
  ))
  with check (athlete_id in (
    select id from public.athletes where coach_id = public.auth_coach_id()
  ));

-- Public read: anonymous + authenticated can read published profiles only.
create policy app_public_select on public.athlete_public_profiles
  for select to anon, authenticated using (is_published = true);
