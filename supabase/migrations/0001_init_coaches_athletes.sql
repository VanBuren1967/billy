-- Plan 1 schema: minimal foundation. Other tables added in Plan 2+.

create extension if not exists "uuid-ossp";

create table public.coaches (
  id            uuid primary key default uuid_generate_v4(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  display_name  text not null,
  email         text not null unique,
  phone         text,
  business_name text,
  bio           text,
  weight_unit_preference text not null default 'lbs' check (weight_unit_preference in ('lbs', 'kg')),
  created_at    timestamptz not null default now()
);

create table public.athletes (
  id            uuid primary key default uuid_generate_v4(),
  coach_id      uuid not null references public.coaches(id) on delete restrict,
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  name          text not null,
  email         text not null unique,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index idx_athletes_coach on public.athletes(coach_id);
create index idx_athletes_auth_user on public.athletes(auth_user_id);
