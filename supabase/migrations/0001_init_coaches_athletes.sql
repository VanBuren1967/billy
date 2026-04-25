-- Plan 1 schema: minimal foundation. Other tables added in Plan 2+.

create extension if not exists "uuid-ossp";
create extension if not exists citext;

create table public.coaches (
  id            uuid primary key default uuid_generate_v4(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  display_name  text not null,
  email         citext not null unique,
  phone         text,
  business_name text,
  bio           text,
  weight_unit_preference text not null default 'lbs' check (weight_unit_preference in ('lbs', 'kg')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.athletes (
  id            uuid primary key default uuid_generate_v4(),
  coach_id      uuid not null references public.coaches(id) on delete restrict,
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  name          text not null,
  email         citext not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Email is unique within a coach's roster, NOT globally — the same human can
  -- legitimately be an athlete under multiple coaches over time. Global email
  -- uniqueness lives in auth.users.
  unique (coach_id, email)
);

-- Coach-scoped athlete queries are the primary access pattern.
create index idx_athletes_coach on public.athletes(coach_id);
-- Note: athletes.auth_user_id is already unique → btree index implicit. No extra index needed.
