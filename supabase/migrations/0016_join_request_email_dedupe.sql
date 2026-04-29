-- Polish: prevent the public /request-to-join form from creating
-- duplicate pending rows for the same email.
--
-- Without this guard, a prospect double-clicking 'submit' (or a
-- spammer hammering the form) creates a row per click. Coach has to
-- triage the duplicates manually.
--
-- A partial unique index on lower(email) restricted to status='pending'
-- means: at most one open request per email. Already-approved or
-- already-declined rows do NOT block a re-submission, so a prospect
-- who was declined can apply again later (e.g. after taking a meet,
-- developing technique).
--
-- email is already citext, so case-folding is automatic; the
-- lower() wrapper is belt-and-suspenders.

create unique index if not exists join_requests_pending_email_uniq
  on public.join_requests (lower(email::text))
  where status = 'pending';
