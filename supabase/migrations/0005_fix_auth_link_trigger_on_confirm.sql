-- Plan 2 fix: the on_auth_user_created trigger fired immediately when
-- supabase.auth.admin.inviteUserByEmail() creates the auth.users row, marking
-- the athletes row 'active' before the prospect ever clicks the magic link.
-- Replace with an UPDATE trigger that fires when email_confirmed_at flips from
-- null to non-null — that's the moment the prospect actually verifies the
-- magic link, which is when we want to mark them active.

drop trigger if exists on_auth_user_created on auth.users;

create or replace function public.link_athlete_on_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null
     and (old.email_confirmed_at is null
          or old.email_confirmed_at is distinct from new.email_confirmed_at)
  then
    update public.athletes
    set    auth_user_id = new.id,
           accepted_at  = now(),
           status       = 'active',
           updated_at   = now()
    where  email = new.email
      and  auth_user_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.link_athlete_on_email_confirmed();
