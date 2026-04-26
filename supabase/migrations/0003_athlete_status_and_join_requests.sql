-- Plan 2: extend athletes lifecycle, add join_requests, auto-link auth users to athletes.

-- 1) Athletes: add invitation lifecycle columns.
alter table public.athletes
  add column status        text         not null default 'active' check (status in ('invited', 'active', 'inactive')),
  add column invited_at    timestamptz,
  add column accepted_at   timestamptz;

-- Existing test rows (created by Plan 1 dev seeding, if any) default to 'active'
-- which is the correct interpretation: they were created directly by a dev, not invited.

-- 2) Join requests: prospect-submitted, coach-reviewed.
create table public.join_requests (
  id                    uuid primary key default uuid_generate_v4(),
  name                  text not null,
  email                 citext not null,
  message               text,
  status                text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_by_coach_id  uuid references public.coaches(id) on delete set null,
  reviewed_at           timestamptz,
  created_at            timestamptz not null default now()
);

-- The approval queue is "pending requests, oldest first". Index covers it.
create index idx_join_requests_status_created on public.join_requests(status, created_at);

-- 3) Trigger: when a new auth.users row is created, link to existing athletes row by email.
-- This is what makes the magic-link invite flow stateless: the coach pre-creates the
-- athletes row with auth_user_id = NULL, sends the invite, and the trigger fills in
-- auth_user_id once the prospect actually completes the magic-link callback.
--
-- Why DEFINER: trigger fires under the auth.users insert context, which doesn't have
-- privileges on public.athletes. The function owner is `postgres` (Supabase default
-- migration runner), which does.
create or replace function public.link_athlete_to_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.athletes
  set    auth_user_id = new.id,
         accepted_at  = now(),
         status       = 'active',
         updated_at   = now()
  where  email = new.email
    and  auth_user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.link_athlete_to_auth_user();
