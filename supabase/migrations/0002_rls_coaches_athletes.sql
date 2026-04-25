-- Enable RLS on every table from Day 1.
alter table public.coaches  enable row level security;
alter table public.athletes enable row level security;

-- COACHES: a coach can read/update only their own row.
create policy "coach reads own row"
  on public.coaches for select
  using (auth_user_id = auth.uid());

create policy "coach updates own row"
  on public.coaches for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ATHLETES: a coach can read/update athletes they own.
create policy "coach reads own athletes"
  on public.athletes for select
  using (
    coach_id in (select id from public.coaches where auth_user_id = auth.uid())
  );

create policy "coach inserts own athletes"
  on public.athletes for insert
  with check (
    coach_id in (select id from public.coaches where auth_user_id = auth.uid())
  );

create policy "coach updates own athletes"
  on public.athletes for update
  using (
    coach_id in (select id from public.coaches where auth_user_id = auth.uid())
  );

-- ATHLETES: an athlete can read their own row.
create policy "athlete reads own row"
  on public.athletes for select
  using (auth_user_id = auth.uid());

create policy "athlete updates own row"
  on public.athletes for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
