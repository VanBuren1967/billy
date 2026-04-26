-- Plan 2: RLS for join_requests.
-- Anyone (including unauthenticated visitors) can submit a request.
-- Only authenticated coaches can read or update them.

alter table public.join_requests enable row level security;

-- Public can insert. The form is anonymous by design.
-- We accept the spam risk for V1 and will add rate limiting / captcha as a follow-up.
create policy "public inserts join requests"
  on public.join_requests
  for insert
  to anon, authenticated
  with check (true);

-- Coaches can read all join requests.
-- (V1 has a single coach; in V2 this would scope by coach_id, but join_requests
-- aren't yet associated with a specific coach when submitted. A future migration
-- will add a `target_coach_id` column when multi-coach lands.)
create policy "coaches read join requests"
  on public.join_requests
  for select
  to authenticated
  using (
    exists (select 1 from public.coaches where auth_user_id = auth.uid())
  );

-- Coaches can update (approve/decline).
create policy "coaches update join requests"
  on public.join_requests
  for update
  to authenticated
  using (
    exists (select 1 from public.coaches where auth_user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.coaches where auth_user_id = auth.uid())
  );
