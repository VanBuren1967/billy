# Plan 2: Athlete Onboarding & Roster — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** William can accept join requests from prospects via a public form, invite athletes by magic-link email, and see his roster on the coach dashboard. The smallest cohesive slice of the Coaching Core that delivers working software a real coach could use.

**Architecture:**
- **Public form** at `/request-to-join` writes to a `join_requests` table.
- **Coach approval queue** at `/coach/requests` lists pending requests; approving triggers a server action that (a) creates an `athletes` row with `status='invited'`, (b) calls `supabase.auth.admin.inviteUserByEmail()` to send the magic link, (c) marks the join request `approved`.
- **First-login auto-link** via Postgres trigger: when a new `auth.users` row is created, the trigger updates the matching `athletes` row (by email) to set `auth_user_id`, `accepted_at`, and `status='active'`. This keeps the magic-link flow stateless.
- **Coach roster** at `/coach/athletes` lists current athletes; `/coach/athletes/[id]` shows a single athlete's profile (placeholder for future workout/check-in data).
- **Direct invite** at `/coach/athletes/invite` lets William invite an athlete by email without a join request first.
- Service-role Supabase client lives in `lib/supabase/admin.ts`. Only server actions and route handlers may use it, and they must verify the caller is a coach before using it.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Supabase JS v2 (`@supabase/ssr` for user-scoped, `@supabase/supabase-js` for service-role), Zod for validation, Resend for prospect-facing transactional email (request received notice), Vitest + Testing Library, Playwright. RLS enforces tenant isolation; UI gating is defense-in-depth via `proxy.ts`.

**Spec reference:** `docs/superpowers/specs/2026-04-25-billy-coaching-platform-design.md` (sections "V1 scope → Coaching Core" and "Constraints & decisions → Auth").

**Working directory for all commands:** `C:\Users\van\Desktop\billy` (use forward slashes in bash). All `pnpm` commands run from the repo root unless noted.

**Builds on:** Plan 1 (`docs/superpowers/plans/2026-04-25-billy-01-foundation-auth.md`). Required tables: `coaches`, `athletes`. Required infra: Supabase project, Vercel, Sentry, magic-link auth working end-to-end.

---

## Out of scope (deferred to later plans)

- Program builder, workout logging, check-ins, alerts (Plan 3+).
- Public athlete profiles + Stripe Connect donations (Plan 6).
- Athlete onboarding wizard (just prompts for weight unit, body weight, etc. on first login). For V1 we accept the bare minimum and let athletes edit later from a settings page that comes in Plan 4.
- Email templates with full Vault branding for the magic-link itself. Plan 2 ships using Supabase's default magic-link email template; theming the magic-link email is a Plan 2.5 polish item once Supabase's SMTP is pointed at Resend.
- Captcha / rate limiting on the public `/request-to-join` form. Logged as a known V1 risk; mitigation deferred to a follow-up. Supabase's per-IP rate limit on inserts is our only protection at launch.
- Bulk invite (CSV upload). Single-email invites only.

---

## File map (Plan 2)

| Path | Purpose |
|---|---|
| `package.json` | Add `resend` dependency |
| `.env.example`, `.env.local` | Add `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| `supabase/migrations/0003_athlete_status_and_join_requests.sql` | Extend athletes; create `join_requests`; create `link_athlete_to_auth_user` trigger |
| `supabase/migrations/0004_rls_join_requests.sql` | RLS policies for `join_requests` |
| `lib/supabase/admin.ts` | Service-role Supabase client factory (server-only) |
| `lib/email/resend.ts` | Resend SDK client |
| `lib/email/templates/request-received.ts` | Plain-text + HTML for "we got your request" |
| `lib/validation/join-request.ts` | Zod schemas for the public form |
| `lib/validation/invite.ts` | Zod schema for direct invite |
| `lib/coach/invite-athlete.ts` | Server-only fn: create athletes row + Supabase admin invite |
| `lib/coach/assert-coach.ts` | Server-only guard: throw if caller isn't a coach |
| `app/request-to-join/page.tsx` | Public RSC: renders form |
| `app/request-to-join/form.tsx` | Client form component (handles submit state) |
| `app/request-to-join/actions.ts` | `submitJoinRequest` server action |
| `app/request-to-join/thanks/page.tsx` | Confirmation page |
| `app/coach/requests/page.tsx` | RSC: pending + recent requests |
| `app/coach/requests/actions.ts` | `approveJoinRequest`, `declineJoinRequest` |
| `app/coach/requests/request-card.tsx` | Single request card (server) with form-action approve/decline |
| `app/coach/athletes/page.tsx` | RSC: athlete roster |
| `app/coach/athletes/athletes-table.tsx` | Roster table component |
| `app/coach/athletes/[id]/page.tsx` | RSC: athlete detail |
| `app/coach/athletes/invite/page.tsx` | RSC: invite form wrapper |
| `app/coach/athletes/invite/form.tsx` | Client form for direct invite |
| `app/coach/athletes/invite/actions.ts` | `directInviteAthlete` server action |
| `app/coach/page.tsx` | (modify) Replace placeholder body with nav cards linking to `/coach/requests` and `/coach/athletes` and a snapshot of pending request count |
| `app/coach/layout.tsx` | (modify) Add nav links to header |
| `tests/unit/invite-athlete.test.ts` | Unit test for `inviteAthlete` |
| `tests/unit/join-request-validation.test.ts` | Zod schema tests |
| `tests/unit/assert-coach.test.ts` | Guard test |
| `tests/e2e/request-to-join.spec.ts` | E2E: prospect submits → coach sees → approves → magic-link path |
| `tests/e2e/direct-invite.spec.ts` | E2E: coach uses direct invite → athlete row created |

---

## Pre-flight (ONCE, before Task 1)

- [ ] **PF-1.** Create a Resend account at https://resend.com (free tier includes 3,000 emails/month + 100 emails/day, no card required). After signing up:
   - Generate an API key under "API Keys → Create API Key" with **Full Access** scope. Save it; you'll paste it into `.env.local` in Task 1.
   - For local dev, you can send from `onboarding@resend.dev` (Resend's shared sandbox sender) — no domain verification required, but emails will only deliver to the address you signed up with.
   - For production, add and verify the project's email domain (e.g., `mail.steele-co.com`) under "Domains → Add Domain" and update DNS. **Production verification is not blocking for Plan 2** — local dev works with the sandbox sender. Add a TODO comment in `lib/email/resend.ts` so future-you remembers.

- [ ] **PF-2.** Confirm the local Supabase project is running and migrations 0001 + 0002 are applied:

```bash
pnpm exec supabase status
```

Expected: `API URL`, `DB URL`, `Studio URL` all reported with no errors. If `supabase status` reports it's stopped, run `pnpm exec supabase start` and wait for it to come up.

```bash
pnpm exec supabase migration list
```

Expected: shows `0001_init_coaches_athletes` and `0002_rls_coaches_athletes` as Applied.

- [ ] **PF-3.** Confirm at least one coach row exists for the development user. From the repo root:

```bash
pnpm exec supabase db reset
```

This re-runs migrations and the seed. (If you don't have a seed yet, manually insert a coach via Supabase Studio: open `http://localhost:54323`, navigate to `auth.users` and create a user with your real email, then in `public.coaches` insert a row with that user's `id` as `auth_user_id`, your email, and `display_name='William Steele'`.) Plan 2 assumes one coach exists; the `/coach/*` routes won't render otherwise.

---

## Task 1: Add Resend dependency and environment variables

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `.env.local` (gitignored)

- [ ] **Step 1: Add the `resend` package**

```bash
pnpm add resend
```

Expected output: `+ resend <version>` and updated `pnpm-lock.yaml`. Resend's SDK is a pure REST wrapper, no native deps.

- [ ] **Step 2: Update `.env.example` with new vars**

Append to `.env.example`:

```bash
# Resend (transactional email)
RESEND_API_KEY=
# Use onboarding@resend.dev locally; switch to a verified domain sender in prod.
RESEND_FROM_EMAIL=onboarding@resend.dev
```

- [ ] **Step 3: Update `.env.local` with the real values**

Append to your local `.env.local`:

```bash
RESEND_API_KEY=re_<paste-from-resend-dashboard>
RESEND_FROM_EMAIL=onboarding@resend.dev
```

- [ ] **Step 4: Verify env loading**

```bash
pnpm typecheck
```

Expected: passes. Resend is installed and ready; we'll wire the client in Task 5.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example
git commit -m "feat(deps): add resend SDK + env vars for transactional email"
```

---

## Task 2: Migration — extend athletes status fields, create join_requests, add auth-link trigger

**Files:**
- Create: `supabase/migrations/0003_athlete_status_and_join_requests.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0003_athlete_status_and_join_requests.sql`:

```sql
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
```

- [ ] **Step 2: Apply the migration**

```bash
pnpm exec supabase migration up
```

Expected output: applies `0003_athlete_status_and_join_requests`. No errors.

- [ ] **Step 3: Verify the schema**

```bash
pnpm exec supabase db diff --schema public
```

Expected: empty diff (DB matches migrations).

Open `http://localhost:54323` (Supabase Studio) → Table Editor → `athletes`. Confirm new columns: `status`, `invited_at`, `accepted_at`. Confirm `join_requests` table exists with the expected columns.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_athlete_status_and_join_requests.sql
git commit -m "feat(db): athlete status fields, join_requests, auto-link trigger"
```

---

## Task 3: RLS for join_requests

**Files:**
- Create: `supabase/migrations/0004_rls_join_requests.sql`

- [ ] **Step 1: Write the RLS migration**

Create `supabase/migrations/0004_rls_join_requests.sql`:

```sql
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
```

- [ ] **Step 2: Apply the migration**

```bash
pnpm exec supabase migration up
```

Expected: applies `0004_rls_join_requests`.

- [ ] **Step 3: Verify the policies**

In Supabase Studio → Authentication → Policies → `join_requests`. Confirm three policies present: `public inserts join requests`, `coaches read join requests`, `coaches update join requests`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_rls_join_requests.sql
git commit -m "feat(db): RLS policies for join_requests"
```

---

## Task 4: Service-role Supabase client + `assertCoach` guard

**Files:**
- Create: `lib/supabase/admin.ts`
- Create: `lib/coach/assert-coach.ts`
- Create: `tests/unit/assert-coach.test.ts`

- [ ] **Step 1: Create the service-role client factory**

Create `lib/supabase/admin.ts`:

```ts
// Service-role Supabase client. Bypasses RLS. ONLY use in server actions or route
// handlers, never in RSCs or client code. Every call site MUST first verify the
// caller is authorized (e.g., via assertCoach) before using this client.
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/supabase/env';

export function createAdminClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

- [ ] **Step 2: Create the coach guard**

Create `lib/coach/assert-coach.ts`:

```ts
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth/get-user-role';

export class NotCoachError extends Error {
  constructor() {
    super('Caller is not authenticated as a coach.');
    this.name = 'NotCoachError';
  }
}

/**
 * Resolves the current user's role and returns the coach id if they are a coach.
 * Throws NotCoachError otherwise. Use at the top of every coach-only server action
 * before reaching for the admin client.
 */
export async function assertCoach(): Promise<{ coachId: string }> {
  const supabase = await createClient();
  const role = await getUserRole(supabase);
  if (role.kind !== 'coach') throw new NotCoachError();
  return { coachId: role.coachId };
}
```

- [ ] **Step 3: Write the failing test**

Create `tests/unit/assert-coach.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks so they're in scope when the SUT imports its deps.
const getUserRoleMock = vi.fn();
const createClientMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}));
vi.mock('@/lib/auth/get-user-role', () => ({
  getUserRole: (c: unknown) => getUserRoleMock(c),
}));

import { assertCoach, NotCoachError } from '@/lib/coach/assert-coach';

describe('assertCoach', () => {
  beforeEach(() => {
    getUserRoleMock.mockReset();
    createClientMock.mockReset();
    createClientMock.mockResolvedValue({});
  });

  it('returns the coachId when role is coach', async () => {
    getUserRoleMock.mockResolvedValue({ kind: 'coach', coachId: 'c1' });
    await expect(assertCoach()).resolves.toEqual({ coachId: 'c1' });
  });

  it('throws NotCoachError when role is athlete', async () => {
    getUserRoleMock.mockResolvedValue({ kind: 'athlete', athleteId: 'a1', coachId: 'c1' });
    await expect(assertCoach()).rejects.toBeInstanceOf(NotCoachError);
  });

  it('throws NotCoachError when unauthenticated', async () => {
    getUserRoleMock.mockResolvedValue({ kind: 'unauthenticated' });
    await expect(assertCoach()).rejects.toBeInstanceOf(NotCoachError);
  });

  it('throws NotCoachError when unlinked', async () => {
    getUserRoleMock.mockResolvedValue({ kind: 'unlinked' });
    await expect(assertCoach()).rejects.toBeInstanceOf(NotCoachError);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm test tests/unit/assert-coach.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/admin.ts lib/coach/assert-coach.ts tests/unit/assert-coach.test.ts
git commit -m "feat(auth): service-role client + assertCoach guard"
```

---

## Task 5: Resend client + request-received email template

**Files:**
- Create: `lib/email/resend.ts`
- Create: `lib/email/templates/request-received.ts`

- [ ] **Step 1: Create the Resend client wrapper**

Create `lib/email/resend.ts`:

```ts
import 'server-only';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;

if (!RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set. Add it to .env.local and Vercel env.');
}
if (!RESEND_FROM_EMAIL) {
  throw new Error('RESEND_FROM_EMAIL is not set. Add it to .env.local and Vercel env.');
}

// TODO(prod): swap RESEND_FROM_EMAIL from `onboarding@resend.dev` to a verified
// domain sender (e.g., `noreply@mail.steele-co.com`) once DNS is configured in
// the Resend dashboard.
export const resend = new Resend(RESEND_API_KEY);
export const FROM_EMAIL = RESEND_FROM_EMAIL;

export type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail({ to, subject, html, text }: SendEmailArgs) {
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
    text,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
  return { id: data?.id };
}
```

- [ ] **Step 2: Create the "request received" template**

Create `lib/email/templates/request-received.ts`:

```ts
export function requestReceivedEmail(name: string) {
  const subject = 'We received your inquiry — Steele & Co.';
  const text = `Hi ${name},

We've received your inquiry. William will personally review every request and respond within a few days. If you're a fit, you'll receive an invite by email to join the platform.

Talk soon,
Steele & Co.`;
  const html = `
    <!doctype html>
    <html>
      <body style="margin:0;padding:32px;background:#080808;font-family:Georgia,serif;color:#f4f0e8;">
        <div style="max-width:560px;margin:0 auto;">
          <p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#c9a14c;margin:0 0 16px;">Steele &amp; Co.</p>
          <h1 style="font-size:24px;margin:0 0 24px;font-weight:normal;">Inquiry received.</h1>
          <p style="line-height:1.6;color:#a39d8a;margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
          <p style="line-height:1.6;color:#a39d8a;margin:0 0 16px;">
            We've received your inquiry. William personally reviews every request and will respond within a few days.
            If you're a fit, you'll receive an invite by email to join the platform.
          </p>
          <p style="line-height:1.6;color:#a39d8a;margin:0 0 24px;">Talk soon,<br/>Steele &amp; Co.</p>
          <hr style="border:none;border-top:1px solid #1a1814;margin:32px 0;"/>
          <p style="font-size:11px;letter-spacing:0.05em;color:#6a6457;margin:0;">
            This is an automated confirmation. Replies aren't monitored.
          </p>
        </div>
      </body>
    </html>
  `;
  return { subject, text, html };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

- [ ] **Step 3: Manual smoke test (optional, requires real RESEND_API_KEY)**

Create a one-off script `scripts/test-resend.ts` (delete after):

```ts
import { sendEmail } from '../lib/email/resend';
import { requestReceivedEmail } from '../lib/email/templates/request-received';

const tpl = requestReceivedEmail('Test User');
sendEmail({ to: 'YOUR_EMAIL@example.com', ...tpl })
  .then((r) => console.log('sent:', r))
  .catch((e) => console.error('failed:', e));
```

Run: `pnpm exec tsx scripts/test-resend.ts`. Expected: receives the email at the address you registered Resend with. Delete the script after.

- [ ] **Step 4: Commit**

```bash
git add lib/email/resend.ts lib/email/templates/request-received.ts
git commit -m "feat(email): resend client + request-received template"
```

---

## Task 6: Zod validation schemas

**Files:**
- Create: `lib/validation/join-request.ts`
- Create: `lib/validation/invite.ts`
- Create: `tests/unit/join-request-validation.test.ts`

- [ ] **Step 1: Write the join-request schema**

Create `lib/validation/join-request.ts`:

```ts
import { z } from 'zod';

export const joinRequestSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email.'),
  message: z.string().trim().max(2000).optional().or(z.literal('')),
});

export type JoinRequestInput = z.infer<typeof joinRequestSchema>;
```

- [ ] **Step 2: Write the invite schema**

Create `lib/validation/invite.ts`:

```ts
import { z } from 'zod';

export const inviteSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email.'),
});

export type InviteInput = z.infer<typeof inviteSchema>;
```

- [ ] **Step 3: Write the failing tests**

Create `tests/unit/join-request-validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { joinRequestSchema } from '@/lib/validation/join-request';

describe('joinRequestSchema', () => {
  it('accepts a minimal valid input', () => {
    const r = joinRequestSchema.parse({ name: 'Alice Smith', email: 'alice@example.com' });
    expect(r.name).toBe('Alice Smith');
    expect(r.email).toBe('alice@example.com');
  });

  it('lowercases and trims email', () => {
    const r = joinRequestSchema.parse({ name: 'Bob', email: '  BOB@EXAMPLE.COM  ' });
    expect(r.email).toBe('bob@example.com');
  });

  it('rejects short names', () => {
    expect(() => joinRequestSchema.parse({ name: 'A', email: 'a@b.com' })).toThrow();
  });

  it('rejects invalid emails', () => {
    expect(() => joinRequestSchema.parse({ name: 'Cara', email: 'not-an-email' })).toThrow();
  });

  it('treats empty message as ok', () => {
    const r = joinRequestSchema.parse({ name: 'Dan', email: 'd@e.com', message: '' });
    expect(r.message).toBe('');
  });

  it('rejects message > 2000 chars', () => {
    expect(() =>
      joinRequestSchema.parse({ name: 'Eve', email: 'e@e.com', message: 'x'.repeat(2001) }),
    ).toThrow();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm test tests/unit/join-request-validation.test.ts
```

Expected: 6 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/validation tests/unit/join-request-validation.test.ts
git commit -m "feat(validation): zod schemas for join request and direct invite"
```

---

## Task 7: `inviteAthlete` server-only function (the heart of the invite flow)

**Files:**
- Create: `lib/coach/invite-athlete.ts`
- Create: `tests/unit/invite-athlete.test.ts`

This function is reused by both the approve-join-request flow and the direct invite flow.

- [ ] **Step 1: Write the implementation**

Create `lib/coach/invite-athlete.ts`:

```ts
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type InviteAthleteArgs = {
  coachId: string;
  name: string;
  email: string;
};

export type InviteAthleteResult =
  | { ok: true; athleteId: string; alreadyExisted: boolean }
  | { ok: false; reason: 'duplicate_active' | 'invite_failed'; message: string };

/**
 * Create an athletes row (or reuse an existing 'invited' one) for the given email
 * under this coach, then trigger Supabase to send the magic-link invite email.
 *
 * Idempotency:
 * - If an athletes row with this (coach_id, email) exists with status='invited' or
 *   status='inactive', we resend the invite.
 * - If status='active', we return { ok: false, reason: 'duplicate_active' } — the
 *   caller (UI) decides what to tell the coach.
 *
 * On success, the athletes row has auth_user_id = NULL until the prospect clicks
 * the magic link; the on_auth_user_created trigger fills it in then.
 */
export async function inviteAthlete(
  args: InviteAthleteArgs,
): Promise<InviteAthleteResult> {
  const admin = createAdminClient();
  const email = args.email.trim().toLowerCase();

  // 1) Look up existing row for this (coach_id, email).
  const { data: existing, error: lookupErr } = await admin
    .from('athletes')
    .select('id, status')
    .eq('coach_id', args.coachId)
    .eq('email', email)
    .maybeSingle();
  if (lookupErr) {
    return { ok: false, reason: 'invite_failed', message: lookupErr.message };
  }

  let athleteId: string;
  let alreadyExisted = false;

  if (existing) {
    if (existing.status === 'active') {
      return {
        ok: false,
        reason: 'duplicate_active',
        message: 'This athlete is already active.',
      };
    }
    // Re-invite path: bump invited_at, ensure status='invited'.
    athleteId = existing.id;
    alreadyExisted = true;
    const { error: updateErr } = await admin
      .from('athletes')
      .update({
        name: args.name,
        status: 'invited',
        invited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', athleteId);
    if (updateErr) {
      return { ok: false, reason: 'invite_failed', message: updateErr.message };
    }
  } else {
    // Fresh insert.
    const { data: inserted, error: insertErr } = await admin
      .from('athletes')
      .insert({
        coach_id: args.coachId,
        name: args.name,
        email,
        is_active: true,
        status: 'invited',
        invited_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (insertErr || !inserted) {
      return {
        ok: false,
        reason: 'invite_failed',
        message: insertErr?.message ?? 'Insert failed.',
      };
    }
    athleteId = inserted.id;
  }

  // 2) Send the magic-link invite via Supabase admin API.
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/app`;
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { athlete_id: athleteId, coach_id: args.coachId, name: args.name },
  });
  if (inviteErr) {
    // The athletes row stays as 'invited' — the coach can retry from the UI.
    return { ok: false, reason: 'invite_failed', message: inviteErr.message };
  }

  return { ok: true, athleteId, alreadyExisted };
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/invite-athlete.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const adminMock = {
  from: vi.fn(),
  auth: { admin: { inviteUserByEmail: vi.fn() } },
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => adminMock,
}));

import { inviteAthlete } from '@/lib/coach/invite-athlete';

function makeChain(opts: {
  lookup?: { data: any; error: any };
  update?: { error: any };
  insert?: { data: any; error: any };
}) {
  // The chain `.from(table).select().eq().eq().maybeSingle()` for lookup,
  // `.from(table).update().eq()` for update,
  // `.from(table).insert().select().single()` for insert.
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue(opts.lookup ?? { data: null, error: null }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(opts.update ?? { error: null }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue(opts.insert ?? { data: { id: 'new-athlete-id' }, error: null }),
      }),
    }),
  };
}

describe('inviteAthlete', () => {
  beforeEach(() => {
    adminMock.from.mockReset();
    adminMock.auth.admin.inviteUserByEmail.mockReset();
    adminMock.auth.admin.inviteUserByEmail.mockResolvedValue({ error: null });
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
  });

  it('inserts athletes row + sends invite when none exists', async () => {
    adminMock.from.mockReturnValue(makeChain({ lookup: { data: null, error: null } }));
    const r = await inviteAthlete({ coachId: 'c1', name: 'Alice', email: 'alice@example.com' });
    expect(r).toEqual({ ok: true, athleteId: 'new-athlete-id', alreadyExisted: false });
    expect(adminMock.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'alice@example.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('/auth/callback?next=/app') }),
    );
  });

  it('re-invites when existing row is invited', async () => {
    adminMock.from.mockReturnValue(
      makeChain({
        lookup: { data: { id: 'existing-id', status: 'invited' }, error: null },
      }),
    );
    const r = await inviteAthlete({ coachId: 'c1', name: 'Bob', email: 'bob@example.com' });
    expect(r).toEqual({ ok: true, athleteId: 'existing-id', alreadyExisted: true });
  });

  it('refuses when athlete is already active', async () => {
    adminMock.from.mockReturnValue(
      makeChain({
        lookup: { data: { id: 'existing-id', status: 'active' }, error: null },
      }),
    );
    const r = await inviteAthlete({ coachId: 'c1', name: 'Cara', email: 'cara@example.com' });
    expect(r).toEqual({
      ok: false,
      reason: 'duplicate_active',
      message: 'This athlete is already active.',
    });
    expect(adminMock.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('lowercases the email before lookup and invite', async () => {
    adminMock.from.mockReturnValue(makeChain({ lookup: { data: null, error: null } }));
    await inviteAthlete({ coachId: 'c1', name: 'Dan', email: '  Dan@Example.com  ' });
    expect(adminMock.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'dan@example.com',
      expect.anything(),
    );
  });

  it('returns invite_failed when Supabase invite errors', async () => {
    adminMock.from.mockReturnValue(makeChain({ lookup: { data: null, error: null } }));
    adminMock.auth.admin.inviteUserByEmail.mockResolvedValue({ error: { message: 'rate limited' } });
    const r = await inviteAthlete({ coachId: 'c1', name: 'Eve', email: 'eve@example.com' });
    expect(r).toEqual({ ok: false, reason: 'invite_failed', message: 'rate limited' });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test tests/unit/invite-athlete.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 4: Commit**

```bash
git add lib/coach/invite-athlete.ts tests/unit/invite-athlete.test.ts
git commit -m "feat(coach): inviteAthlete creates athletes row + sends magic-link invite"
```

---

## Task 8: Public `/request-to-join` page + form + action

**Files:**
- Create: `app/request-to-join/page.tsx`
- Create: `app/request-to-join/form.tsx`
- Create: `app/request-to-join/actions.ts`
- Create: `app/request-to-join/thanks/page.tsx`

- [ ] **Step 1: Server action**

Create `app/request-to-join/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { joinRequestSchema } from '@/lib/validation/join-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/resend';
import { requestReceivedEmail } from '@/lib/email/templates/request-received';

export type SubmitJoinRequestState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string; fields?: { name?: string; email?: string; message?: string } };

export async function submitJoinRequest(
  _prev: SubmitJoinRequestState,
  formData: FormData,
): Promise<SubmitJoinRequestState> {
  const parsed = joinRequestSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    message: formData.get('message') ?? '',
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      kind: 'error',
      message: 'Please correct the highlighted fields.',
      fields: {
        name: flat.fieldErrors.name?.[0],
        email: flat.fieldErrors.email?.[0],
        message: flat.fieldErrors.message?.[0],
      },
    };
  }

  // Use the admin client because the public form is unauthenticated; the RLS
  // policy already permits inserts from `anon`, but using the admin client here
  // sidesteps cookie/anon-session edge cases.
  const admin = createAdminClient();
  const { error } = await admin.from('join_requests').insert({
    name: parsed.data.name,
    email: parsed.data.email,
    message: parsed.data.message || null,
  });
  if (error) {
    return { kind: 'error', message: 'Something went wrong. Please try again.' };
  }

  // Confirmation email — non-blocking failure: log and continue.
  try {
    const tpl = requestReceivedEmail(parsed.data.name);
    await sendEmail({ to: parsed.data.email, ...tpl });
  } catch (e) {
    console.error('[request-to-join] confirmation email failed', e);
  }

  redirect('/request-to-join/thanks');
}
```

- [ ] **Step 2: Client form**

Create `app/request-to-join/form.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { submitJoinRequest, type SubmitJoinRequestState } from './actions';

const initialState: SubmitJoinRequestState = { kind: 'idle' };

export function RequestToJoinForm() {
  const [state, action, pending] = useActionState(submitJoinRequest, initialState);
  const fieldErrors = state.kind === 'error' ? state.fields : undefined;

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="text-bone-muted text-xs tracking-widest uppercase">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={100}
          autoComplete="name"
          aria-describedby={fieldErrors?.name ? 'name-error' : undefined}
          className="border-hairline-strong bg-ink-900 text-bone focus:border-gold focus:outline-gold border px-4 py-3 focus:outline-2 focus:outline-offset-2"
        />
        {fieldErrors?.name && (
          <p id="name-error" role="alert" className="text-gold text-xs">
            {fieldErrors.name}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-bone-muted text-xs tracking-widest uppercase">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-describedby={fieldErrors?.email ? 'email-error' : undefined}
          className="border-hairline-strong bg-ink-900 text-bone focus:border-gold focus:outline-gold border px-4 py-3 focus:outline-2 focus:outline-offset-2"
        />
        {fieldErrors?.email && (
          <p id="email-error" role="alert" className="text-gold text-xs">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="message" className="text-bone-muted text-xs tracking-widest uppercase">
          Message <span className="lowercase">(optional)</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          maxLength={2000}
          aria-describedby={fieldErrors?.message ? 'message-error' : undefined}
          className="border-hairline-strong bg-ink-900 text-bone focus:border-gold focus:outline-gold border px-4 py-3 focus:outline-2 focus:outline-offset-2"
        />
        {fieldErrors?.message && (
          <p id="message-error" role="alert" className="text-gold text-xs">
            {fieldErrors.message}
          </p>
        )}
      </div>

      {state.kind === 'error' && (
        <p role="status" className="text-gold text-sm">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="border-gold text-gold hover:bg-gold hover:text-ink-950 focus-visible:outline-gold border px-6 py-3 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
      >
        {pending ? 'Submitting…' : 'Submit inquiry'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Page**

Create `app/request-to-join/page.tsx`:

```tsx
import Link from 'next/link';
import { PublicNav } from '@/components/public-nav';
import { RequestToJoinForm } from './form';

export const metadata = { title: 'Inquire — Steele & Co.' };

export default function RequestToJoinPage() {
  return (
    <>
      <PublicNav />
      <section className="mx-auto max-w-2xl px-6 py-20">
        <p className="text-gold text-xs tracking-widest uppercase">Steele &amp; Co.</p>
        <h1 className="text-bone mt-3 font-serif text-4xl leading-tight tracking-tight md:text-5xl">
          Inquire about <em className="text-gold">coaching</em>.
        </h1>
        <p className="text-bone-muted mt-6 max-w-xl">
          Tell us about your training and your goals. William personally reviews every inquiry and
          will respond within a few days.
        </p>
        <div className="mt-12">
          <RequestToJoinForm />
        </div>
        <p className="text-bone-faint mt-12 text-xs tracking-wider uppercase">
          Already a member?{' '}
          <Link href="/login" className="text-gold underline">
            Sign in
          </Link>
        </p>
      </section>
    </>
  );
}
```

- [ ] **Step 4: Thanks page**

Create `app/request-to-join/thanks/page.tsx`:

```tsx
import Link from 'next/link';
import { PublicNav } from '@/components/public-nav';

export const metadata = { title: 'Inquiry received — Steele & Co.' };

export default function ThanksPage() {
  return (
    <>
      <PublicNav />
      <section className="mx-auto max-w-2xl px-6 py-32">
        <p className="text-gold text-xs tracking-widest uppercase">Steele &amp; Co.</p>
        <h1 className="text-bone mt-3 font-serif text-4xl leading-tight tracking-tight md:text-5xl">
          Inquiry <em className="text-gold">received</em>.
        </h1>
        <p className="text-bone-muted mt-6 max-w-xl">
          Check your inbox for a confirmation. William personally reviews every inquiry and will
          respond within a few days.
        </p>
        <div className="mt-12">
          <Link
            href="/"
            className="text-bone-muted hover:text-bone focus-visible:outline-gold text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            ← Back home
          </Link>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 5: Manual verification**

```bash
pnpm dev
```

Visit `http://localhost:3000/request-to-join`. Fill out the form, submit. Expected: redirected to `/request-to-join/thanks`. In Supabase Studio → `join_requests` → see your row with `status='pending'`. If `RESEND_API_KEY` is set, you should receive the confirmation email at the address you registered Resend with (only delivers there in sandbox mode).

Stop server.

- [ ] **Step 6: Commit**

```bash
git add app/request-to-join
git commit -m "feat(public): /request-to-join form, server action, and thanks page"
```

---

## Task 9: Coach `/coach/requests` approval queue + actions

**Files:**
- Create: `app/coach/requests/page.tsx`
- Create: `app/coach/requests/request-card.tsx`
- Create: `app/coach/requests/actions.ts`

- [ ] **Step 1: Server actions**

These actions have a simple `(FormData) => Promise<void>` signature so they can be wired directly to `<form action={...}>` without `useActionState`. Coach feedback is via `revalidatePath` (the page re-renders with the new status). Failures throw and surface via Next's error boundary; we deliberately don't render inline error state on the card to keep the queue UI calm.

Create `app/coach/requests/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { assertCoach } from '@/lib/coach/assert-coach';
import { createAdminClient } from '@/lib/supabase/admin';
import { inviteAthlete } from '@/lib/coach/invite-athlete';

export async function approveJoinRequest(formData: FormData): Promise<void> {
  const requestId = formData.get('requestId');
  if (typeof requestId !== 'string' || !requestId) {
    throw new Error('Missing request id.');
  }

  const { coachId } = await assertCoach();
  const admin = createAdminClient();

  const { data: req, error: reqErr } = await admin
    .from('join_requests')
    .select('id, name, email, status')
    .eq('id', requestId)
    .maybeSingle();
  if (reqErr || !req) throw new Error('Request not found.');
  if (req.status !== 'pending') {
    throw new Error(`Request is already ${req.status}.`);
  }

  const result = await inviteAthlete({ coachId, name: req.name, email: req.email });
  if (!result.ok) {
    throw new Error(result.message);
  }

  const { error: updateErr } = await admin
    .from('join_requests')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by_coach_id: coachId,
    })
    .eq('id', requestId);
  if (updateErr) throw new Error(updateErr.message);

  revalidatePath('/coach/requests');
  revalidatePath('/coach/athletes');
  revalidatePath('/coach');
}

export async function declineJoinRequest(formData: FormData): Promise<void> {
  const requestId = formData.get('requestId');
  if (typeof requestId !== 'string' || !requestId) {
    throw new Error('Missing request id.');
  }

  const { coachId } = await assertCoach();
  const admin = createAdminClient();
  const { error } = await admin
    .from('join_requests')
    .update({
      status: 'declined',
      reviewed_at: new Date().toISOString(),
      reviewed_by_coach_id: coachId,
    })
    .eq('id', requestId)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);

  revalidatePath('/coach/requests');
  revalidatePath('/coach');
}
```

- [ ] **Step 2: Request card component**

Create `app/coach/requests/request-card.tsx`:

```tsx
import { approveJoinRequest, declineJoinRequest } from './actions';

type Request = {
  id: string;
  name: string;
  email: string;
  message: string | null;
  created_at: string;
  status: 'pending' | 'approved' | 'declined';
};

export function RequestCard({ request }: { request: Request }) {
  const submittedAt = new Date(request.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const isPending = request.status === 'pending';

  return (
    <article className="border-hairline-strong bg-ink-900 border p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-bone font-serif text-xl">{request.name}</h3>
          <p className="text-bone-muted text-sm">{request.email}</p>
        </div>
        <span className="text-bone-faint text-xs tracking-widest uppercase">{submittedAt}</span>
      </header>

      {request.message && (
        <p className="text-bone-muted border-hairline-strong mt-4 border-l-2 pl-4 text-sm leading-relaxed whitespace-pre-line">
          {request.message}
        </p>
      )}

      {isPending ? (
        <div className="mt-6 flex gap-3">
          <form action={approveJoinRequest}>
            <input type="hidden" name="requestId" value={request.id} />
            <button
              type="submit"
              className="border-gold text-gold hover:bg-gold hover:text-ink-950 focus-visible:outline-gold border px-5 py-2 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Approve &amp; invite
            </button>
          </form>
          <form action={declineJoinRequest}>
            <input type="hidden" name="requestId" value={request.id} />
            <button
              type="submit"
              className="border-hairline-strong text-bone-muted hover:text-bone focus-visible:outline-gold border px-5 py-2 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Decline
            </button>
          </form>
        </div>
      ) : (
        <p className="text-bone-faint mt-6 text-xs tracking-widest uppercase">
          {request.status}
        </p>
      )}
    </article>
  );
}
```

- [ ] **Step 3: Page**

Create `app/coach/requests/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { RequestCard } from './request-card';

export const metadata = { title: 'Requests — Steele & Co.' };

type Request = {
  id: string;
  name: string;
  email: string;
  message: string | null;
  created_at: string;
  status: 'pending' | 'approved' | 'declined';
};

export default async function RequestsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('join_requests')
    .select('id, name, email, message, created_at, status')
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-bone font-serif text-3xl">Requests</h1>
        <p className="text-gold">Could not load requests: {error.message}</p>
      </div>
    );
  }

  const all = (data ?? []) as Request[];
  const pending = all.filter((r) => r.status === 'pending');
  const reviewed = all.filter((r) => r.status !== 'pending');

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <p className="text-gold text-xs tracking-widest uppercase">Approval queue</p>
        <h1 className="text-bone font-serif text-4xl">Requests</h1>
        <p className="text-bone-muted">
          {pending.length === 0
            ? 'No pending requests.'
            : `${pending.length} pending ${pending.length === 1 ? 'request' : 'requests'}.`}
        </p>
      </header>

      {pending.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-bone-muted text-xs tracking-widest uppercase">Pending</h2>
          {pending.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </section>
      )}

      {reviewed.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-bone-muted text-xs tracking-widest uppercase">Recent decisions</h2>
          {reviewed.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

```bash
pnpm dev
```

Sign in as coach (magic link), then visit `http://localhost:3000/coach/requests`. Expected: shows the join request submitted in Task 8. Click "Approve & invite". Expected:
- Page reloads, the card moves to "Recent decisions" with status="approved".
- In Supabase Studio → `athletes` → new row with `status='invited'`, `auth_user_id=NULL`.
- The prospect's email receives the magic-link invite (from Supabase default sender at `noreply@mail.app.supabase.io`).
- Open Supabase Studio → Authentication → Users → the prospect appears with `email_confirmed_at=NULL` and an `invited_at` timestamp.

Stop server.

- [ ] **Step 5: Commit**

```bash
git add app/coach/requests
git commit -m "feat(coach): /requests approval queue with approve/decline server actions"
```

---

## Task 10: Coach `/coach/athletes` roster

**Files:**
- Create: `app/coach/athletes/page.tsx`
- Create: `app/coach/athletes/athletes-table.tsx`

- [ ] **Step 1: Roster table component**

Create `app/coach/athletes/athletes-table.tsx`:

```tsx
import Link from 'next/link';

type Athlete = {
  id: string;
  name: string;
  email: string;
  status: 'invited' | 'active' | 'inactive';
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<Athlete['status'], string> = {
  invited: 'Invited',
  active: 'Active',
  inactive: 'Inactive',
};

const STATUS_COLOR: Record<Athlete['status'], string> = {
  invited: 'text-gold',
  active: 'text-bone',
  inactive: 'text-bone-faint',
};

function fmt(dt: string | null) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function AthletesTable({ athletes }: { athletes: Athlete[] }) {
  if (athletes.length === 0) {
    return (
      <div className="border-hairline-strong border p-12 text-center">
        <p className="text-bone-muted">No athletes yet.</p>
        <Link
          href="/coach/athletes/invite"
          className="text-gold mt-6 inline-block text-xs tracking-widest uppercase underline"
        >
          Invite your first athlete
        </Link>
      </div>
    );
  }

  return (
    <div className="border-hairline-strong overflow-x-auto border">
      <table className="w-full text-left text-sm">
        <thead className="border-hairline-strong text-bone-faint border-b text-xs tracking-widest uppercase">
          <tr>
            <th className="px-5 py-3 font-normal">Name</th>
            <th className="px-5 py-3 font-normal">Email</th>
            <th className="px-5 py-3 font-normal">Status</th>
            <th className="px-5 py-3 font-normal">Joined</th>
            <th className="px-5 py-3 font-normal sr-only">Actions</th>
          </tr>
        </thead>
        <tbody>
          {athletes.map((a) => (
            <tr key={a.id} className="border-hairline border-b last:border-0">
              <td className="text-bone px-5 py-4 font-serif">{a.name}</td>
              <td className="text-bone-muted px-5 py-4">{a.email}</td>
              <td className={`px-5 py-4 text-xs tracking-widest uppercase ${STATUS_COLOR[a.status]}`}>
                {STATUS_LABEL[a.status]}
              </td>
              <td className="text-bone-muted px-5 py-4">{fmt(a.accepted_at ?? a.invited_at)}</td>
              <td className="px-5 py-4 text-right">
                <Link
                  href={`/coach/athletes/${a.id}`}
                  className="text-gold text-xs tracking-widest uppercase underline"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Page**

Create `app/coach/athletes/page.tsx`:

```tsx
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AthletesTable } from './athletes-table';

export const metadata = { title: 'Athletes — Steele & Co.' };

type Athlete = {
  id: string;
  name: string;
  email: string;
  status: 'invited' | 'active' | 'inactive';
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

export default async function AthletesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('athletes')
    .select('id, name, email, status, invited_at, accepted_at, created_at')
    .order('status', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-bone font-serif text-3xl">Athletes</h1>
        <p className="text-gold">Could not load roster: {error.message}</p>
      </div>
    );
  }

  const athletes = (data ?? []) as Athlete[];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-gold text-xs tracking-widest uppercase">Roster</p>
          <h1 className="text-bone font-serif text-4xl">Athletes</h1>
          <p className="text-bone-muted">
            {athletes.length === 0
              ? 'No athletes yet.'
              : `${athletes.length} ${athletes.length === 1 ? 'athlete' : 'athletes'}.`}
          </p>
        </div>
        <Link
          href="/coach/athletes/invite"
          className="border-gold text-gold hover:bg-gold hover:text-ink-950 focus-visible:outline-gold border px-5 py-2 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Invite athlete
        </Link>
      </header>

      <AthletesTable athletes={athletes} />
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

```bash
pnpm dev
```

As the coach, visit `http://localhost:3000/coach/athletes`. Expected: shows the athlete row created when you approved the join request in Task 9, status="Invited". Stop server.

- [ ] **Step 4: Commit**

```bash
git add app/coach/athletes/page.tsx app/coach/athletes/athletes-table.tsx
git commit -m "feat(coach): /athletes roster with status column"
```

---

## Task 11: Single athlete view `/coach/athletes/[id]`

**Files:**
- Create: `app/coach/athletes/[id]/page.tsx`

- [ ] **Step 1: Page**

Create `app/coach/athletes/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Athlete — Steele & Co.' };

type Athlete = {
  id: string;
  name: string;
  email: string;
  status: 'invited' | 'active' | 'inactive';
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('athletes')
    .select('id, name, email, status, invited_at, accepted_at, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) notFound();
  const athlete = data as Athlete;

  return (
    <div className="flex flex-col gap-12">
      <Link
        href="/coach/athletes"
        className="text-bone-muted hover:text-bone w-fit text-xs tracking-widest uppercase"
      >
        ← Back to roster
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-gold text-xs tracking-widest uppercase">Athlete</p>
        <h1 className="text-bone font-serif text-5xl tracking-tight">{athlete.name}</h1>
        <p className="text-bone-muted">{athlete.email}</p>
      </header>

      <dl className="border-hairline-strong grid grid-cols-1 gap-x-8 gap-y-6 border p-6 sm:grid-cols-2">
        <div>
          <dt className="text-bone-faint text-xs tracking-widest uppercase">Status</dt>
          <dd className="text-bone mt-1 font-serif">{athlete.status}</dd>
        </div>
        <div>
          <dt className="text-bone-faint text-xs tracking-widest uppercase">Invited</dt>
          <dd className="text-bone-muted mt-1">
            {athlete.invited_at ? new Date(athlete.invited_at).toLocaleString() : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-bone-faint text-xs tracking-widest uppercase">Accepted</dt>
          <dd className="text-bone-muted mt-1">
            {athlete.accepted_at ? new Date(athlete.accepted_at).toLocaleString() : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-bone-faint text-xs tracking-widest uppercase">Added</dt>
          <dd className="text-bone-muted mt-1">{new Date(athlete.created_at).toLocaleString()}</dd>
        </div>
      </dl>

      <section className="border-hairline-strong border p-6">
        <p className="text-bone-faint text-xs tracking-widest uppercase">Coming soon</p>
        <p className="text-bone-muted mt-2 text-sm">
          Programs, workouts, and check-ins will appear here once Plan 3 ships.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

```bash
pnpm dev
```

Visit `/coach/athletes`, click "View" on an athlete. Expected: detail page renders with name, email, status, dates. `/coach/athletes/non-existent-id` should 404. Stop server.

- [ ] **Step 3: Commit**

```bash
git add "app/coach/athletes/[id]"
git commit -m "feat(coach): athlete detail page"
```

---

## Task 12: Direct invite at `/coach/athletes/invite`

**Files:**
- Create: `app/coach/athletes/invite/page.tsx`
- Create: `app/coach/athletes/invite/form.tsx`
- Create: `app/coach/athletes/invite/actions.ts`

- [ ] **Step 1: Server action**

Create `app/coach/athletes/invite/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { inviteSchema } from '@/lib/validation/invite';
import { assertCoach, NotCoachError } from '@/lib/coach/assert-coach';
import { inviteAthlete } from '@/lib/coach/invite-athlete';

export type DirectInviteState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string; fields?: { name?: string; email?: string } };

export async function directInviteAthlete(
  _prev: DirectInviteState,
  formData: FormData,
): Promise<DirectInviteState> {
  let coachId: string;
  try {
    ({ coachId } = await assertCoach());
  } catch (e) {
    if (e instanceof NotCoachError) {
      return { kind: 'error', message: 'You must be signed in as a coach.' };
    }
    throw e;
  }

  const parsed = inviteSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      kind: 'error',
      message: 'Please correct the highlighted fields.',
      fields: {
        name: flat.fieldErrors.name?.[0],
        email: flat.fieldErrors.email?.[0],
      },
    };
  }

  const result = await inviteAthlete({
    coachId,
    name: parsed.data.name,
    email: parsed.data.email,
  });
  if (!result.ok) {
    return { kind: 'error', message: result.message };
  }

  revalidatePath('/coach/athletes');
  revalidatePath('/coach');
  redirect('/coach/athletes');
}
```

- [ ] **Step 2: Client form**

Create `app/coach/athletes/invite/form.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { directInviteAthlete, type DirectInviteState } from './actions';

const initialState: DirectInviteState = { kind: 'idle' };

export function DirectInviteForm() {
  const [state, action, pending] = useActionState(directInviteAthlete, initialState);
  const fieldErrors = state.kind === 'error' ? state.fields : undefined;

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="text-bone-muted text-xs tracking-widest uppercase">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={100}
          autoComplete="off"
          aria-describedby={fieldErrors?.name ? 'name-error' : undefined}
          className="border-hairline-strong bg-ink-900 text-bone focus:border-gold focus:outline-gold border px-4 py-3 focus:outline-2 focus:outline-offset-2"
        />
        {fieldErrors?.name && (
          <p id="name-error" role="alert" className="text-gold text-xs">
            {fieldErrors.name}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-bone-muted text-xs tracking-widest uppercase">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="off"
          aria-describedby={fieldErrors?.email ? 'email-error' : undefined}
          className="border-hairline-strong bg-ink-900 text-bone focus:border-gold focus:outline-gold border px-4 py-3 focus:outline-2 focus:outline-offset-2"
        />
        {fieldErrors?.email && (
          <p id="email-error" role="alert" className="text-gold text-xs">
            {fieldErrors.email}
          </p>
        )}
      </div>

      {state.kind === 'error' && !state.fields && (
        <p role="status" className="text-gold text-sm">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="border-gold text-gold hover:bg-gold hover:text-ink-950 focus-visible:outline-gold border px-6 py-3 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
      >
        {pending ? 'Sending invite…' : 'Send invite'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Page**

Create `app/coach/athletes/invite/page.tsx`:

```tsx
import Link from 'next/link';
import { DirectInviteForm } from './form';

export const metadata = { title: 'Invite athlete — Steele & Co.' };

export default function InviteAthletePage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8">
      <Link
        href="/coach/athletes"
        className="text-bone-muted hover:text-bone w-fit text-xs tracking-widest uppercase"
      >
        ← Back to roster
      </Link>
      <header className="flex flex-col gap-2">
        <p className="text-gold text-xs tracking-widest uppercase">Roster</p>
        <h1 className="text-bone font-serif text-4xl">Invite athlete</h1>
        <p className="text-bone-muted">
          Sends a magic-link invite. The athlete clicks the link in the email, signs in, and lands
          on their dashboard.
        </p>
      </header>
      <DirectInviteForm />
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

```bash
pnpm dev
```

As coach, visit `/coach/athletes/invite`. Submit with a fresh email. Expected: redirected to `/coach/athletes`, new row appears with status="Invited", invite email sent. Stop server.

- [ ] **Step 5: Commit**

```bash
git add app/coach/athletes/invite
git commit -m "feat(coach): direct invite form for adding athletes"
```

---

## Task 13: Wire coach navigation (dashboard cards + header links)

**Files:**
- Modify: `app/coach/page.tsx`
- Modify: `app/coach/layout.tsx`

- [ ] **Step 1: Update the layout with header nav**

Replace the contents of `app/coach/layout.tsx`:

```tsx
import Link from 'next/link';
import { SignOutButton } from '@/components/sign-out-button';

const NAV_LINKS = [
  { href: '/coach', label: 'Dashboard' },
  { href: '/coach/athletes', label: 'Athletes' },
  { href: '/coach/requests', label: 'Requests' },
];

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-hairline flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-8">
          <p className="text-bone font-serif">
            Steele &amp; Co. <span className="text-gold">·</span> Coach
          </p>
          <nav className="hidden gap-6 md:flex">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-bone-muted hover:text-bone focus-visible:outline-gold text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Update the dashboard with snapshot cards**

Replace the contents of `app/coach/page.tsx`:

```tsx
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

type Counts = { pending: number; invited: number; active: number };

async function loadCounts(): Promise<Counts> {
  const supabase = await createClient();
  const [pendingRes, invitedRes, activeRes] = await Promise.all([
    supabase
      .from('join_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('athletes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'invited'),
    supabase
      .from('athletes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
  ]);
  return {
    pending: pendingRes.count ?? 0,
    invited: invitedRes.count ?? 0,
    active: activeRes.count ?? 0,
  };
}

export default async function CoachDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const counts = await loadCounts();

  const cards = [
    {
      label: 'Pending requests',
      value: counts.pending,
      href: '/coach/requests',
      cta: 'Review',
    },
    {
      label: 'Active athletes',
      value: counts.active,
      href: '/coach/athletes',
      cta: 'View roster',
    },
    {
      label: 'Awaiting first sign-in',
      value: counts.invited,
      href: '/coach/athletes',
      cta: 'View roster',
    },
  ];

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <p className="text-gold text-xs tracking-widest uppercase">Coach dashboard</p>
        <h1 className="text-bone font-serif text-4xl">Welcome back.</h1>
        <p className="text-bone-muted">Signed in as {user?.email}.</p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="border-hairline-strong hover:border-gold focus-visible:outline-gold flex flex-col gap-3 border p-6 transition focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <p className="text-bone-faint text-xs tracking-widest uppercase">{c.label}</p>
            <p className="text-bone font-serif text-5xl">{c.value}</p>
            <p className="text-gold mt-2 text-xs tracking-widest uppercase">{c.cta} →</p>
          </Link>
        ))}
      </section>

      <section className="border-hairline-strong border p-6">
        <p className="text-bone-faint text-xs tracking-widest uppercase">Coming soon</p>
        <p className="text-bone-muted mt-2 text-sm">
          Programs, workout logging, weekly check-ins, and athlete alerts ship in Plan 3.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

```bash
pnpm dev
```

As coach, visit `/coach`. Expected: three counter cards (pending requests, active athletes, awaiting first sign-in), a header nav with Dashboard / Athletes / Requests links. Click each. Stop server.

- [ ] **Step 4: Commit**

```bash
git add app/coach/page.tsx app/coach/layout.tsx
git commit -m "feat(coach): dashboard snapshot + header nav"
```

---

## Task 14: E2E — request-to-join through approve

**Files:**
- Create: `tests/e2e/request-to-join.spec.ts`

- [ ] **Step 1: Write the test**

Create `tests/e2e/request-to-join.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// This test exercises the public-facing form. We do NOT test the coach approval
// here — that requires a coach session and is covered indirectly by the
// direct-invite e2e in Task 15. We assert the row landed in `join_requests` via
// the Supabase REST API using the anon key (read disallowed by RLS, so we use
// service role from the test process via env).
//
// Required env in CI / local: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (already
// in .env.local from Plan 1).

const fixture = {
  name: 'Test Prospect',
  email: `prospect+${Date.now()}@example.com`,
  message: 'I have been training for 5 years and want to compete.',
};

test('prospect submits a join request', async ({ page, request }) => {
  await page.goto('/request-to-join');

  await expect(page.getByRole('heading', { name: /Inquire about coaching/i })).toBeVisible();

  await page.getByLabel('Name').fill(fixture.name);
  await page.getByLabel('Email').fill(fixture.email);
  await page.getByLabel(/Message/).fill(fixture.message);

  await page.getByRole('button', { name: /Submit inquiry/i }).click();

  await expect(page).toHaveURL(/\/request-to-join\/thanks$/);
  await expect(page.getByRole('heading', { name: /Inquiry received/i })).toBeVisible();

  // Verify via Supabase REST that the row exists.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await request.get(
    `${supabaseUrl}/rest/v1/join_requests?email=eq.${encodeURIComponent(fixture.email)}&select=name,email,status`,
    { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } },
  );
  expect(res.ok()).toBe(true);
  const rows = (await res.json()) as Array<{ name: string; email: string; status: string }>;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    name: fixture.name,
    email: fixture.email,
    status: 'pending',
  });
});

test('rejects invalid email', async ({ page }) => {
  await page.goto('/request-to-join');
  await page.getByLabel('Name').fill('Test');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByRole('button', { name: /Submit inquiry/i }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page).toHaveURL(/\/request-to-join$/);
});
```

- [ ] **Step 2: Run e2e**

```bash
pnpm test:e2e tests/e2e/request-to-join.spec.ts
```

Expected: 2 passing tests. Playwright will start the dev server (per `playwright.config.ts` — confirm `webServer` is configured to run `pnpm dev`).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/request-to-join.spec.ts
git commit -m "test(e2e): /request-to-join submits and persists"
```

---

## Task 15: E2E — coach direct invite

**Files:**
- Create: `tests/e2e/direct-invite.spec.ts`

This test requires a logged-in coach session. We seed a coach via the service role at test-setup time, then mint a session via Supabase admin and reuse it.

- [ ] **Step 1: Write a coach-session helper**

Create `tests/e2e/helpers/coach-session.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import type { BrowserContext } from '@playwright/test';

export async function ensureCoachAndLogin(context: BrowserContext, baseURL: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `coach+e2e@example.com`;

  // Create or look up the auth user.
  const { data: usersList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = usersList?.users.find((u) => u.email === email);
  if (!user) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error(`createUser failed: ${error?.message}`);
    user = created.user;
  }

  // Ensure coach row.
  const { data: coachRow } = await admin
    .from('coaches')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!coachRow) {
    const { error } = await admin
      .from('coaches')
      .insert({
        auth_user_id: user.id,
        display_name: 'E2E Coach',
        email,
      });
    if (error) throw new Error(`coach insert failed: ${error.message}`);
  }

  // Generate a magic link, then visit it to set the session cookie.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${baseURL}/auth/callback?next=/coach` },
  });
  if (linkErr || !link?.properties?.action_link) {
    throw new Error(`generateLink failed: ${linkErr?.message}`);
  }

  const page = await context.newPage();
  await page.goto(link.properties.action_link);
  await page.waitForURL(/\/coach/);
  await page.close();
}
```

- [ ] **Step 2: Write the test**

Create `tests/e2e/direct-invite.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { ensureCoachAndLogin } from './helpers/coach-session';

test.describe('Coach direct invite', () => {
  test('invites an athlete via /coach/athletes/invite', async ({ context, baseURL }) => {
    await ensureCoachAndLogin(context, baseURL!);

    const page = await context.newPage();
    const athleteEmail = `athlete+${Date.now()}@example.com`;

    await page.goto('/coach/athletes/invite');
    await page.getByLabel('Name').fill('E2E Athlete');
    await page.getByLabel('Email').fill(athleteEmail);
    await page.getByRole('button', { name: /Send invite/i }).click();

    await expect(page).toHaveURL(/\/coach\/athletes$/);
    await expect(page.getByText(athleteEmail)).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Invited' })).toBeVisible();

    // Verify the row exists in the DB.
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data, error } = await admin
      .from('athletes')
      .select('email, status')
      .eq('email', athleteEmail.toLowerCase())
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ email: athleteEmail.toLowerCase(), status: 'invited' });
  });
});
```

- [ ] **Step 3: Run e2e**

```bash
pnpm test:e2e tests/e2e/direct-invite.spec.ts
```

Expected: 1 passing test.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/helpers tests/e2e/direct-invite.spec.ts
git commit -m "test(e2e): coach direct invite + roster shows invited athlete"
```

---

## Task 16: Full smoke test + final commit

- [ ] **Step 1: Run all tests**

```bash
pnpm typecheck
```
Expected: passes.

```bash
pnpm lint
```
Expected: passes (no warnings introduced).

```bash
pnpm format:check
```
Expected: passes. If it fails, run `pnpm format` and recommit.

```bash
pnpm test
```
Expected: all unit tests pass (`assert-coach`, `invite-athlete`, `join-request-validation`, plus existing `getUserRole` and RLS tests).

```bash
pnpm test:e2e
```
Expected: all e2e tests pass (auth-flow, role-routing, request-to-join, direct-invite).

- [ ] **Step 2: Manual end-to-end smoke**

```bash
pnpm dev
```

Walk through the golden path in a real browser:

1. Open an Incognito window. Visit `http://localhost:3000/`. Click "Inquire". Fill form (use a real email you can check), submit. See "Inquiry received." Check inbox for "We received your inquiry — Steele & Co." (only delivers to your Resend-registered email in sandbox mode).
2. Open a second window signed in as the coach. Visit `/coach`. See "1 pending request" card. Click "Review". Click "Approve & invite". See success.
3. Check the prospect's inbox for the magic-link invite from Supabase. Click the link in a third Incognito window. Land on `/app` (athlete dashboard placeholder).
4. Back in the coach window, visit `/coach/athletes`. See the new athlete with status="Active" (the trigger linked them).
5. Visit `/coach/athletes/invite`. Send a fresh invite to a new email. See it land in the roster.

If anything breaks, do not pass go — fix it before commit.

Stop server.

- [ ] **Step 3: Update `.env.example` if you added any vars during execution**

(Should already be done in Task 1; this is a sanity check.)

- [ ] **Step 4: Final commit + push**

If everything is green:

```bash
git status
```

Expected: working tree clean (each task committed individually).

```bash
git log --oneline main..HEAD
```

Expected: lists all Plan 2 commits.

```bash
git push -u origin <branch-name>
```

(If using a feature branch via worktree.) Otherwise this is already on `main` and a final `git push` suffices.

---

## Self-review checklist (run after the plan is implemented)

- [ ] Public form (`/request-to-join`) renders, validates, submits, redirects to thanks.
- [ ] `join_requests` row created on submit; confirmation email sent (when `RESEND_API_KEY` set).
- [ ] Coach can view pending requests at `/coach/requests`.
- [ ] Approving a request creates an `athletes` row with `status='invited'` and triggers a Supabase magic-link invite.
- [ ] Declining a request marks it `declined` without creating an athlete.
- [ ] First magic-link sign-in by an invited prospect causes the trigger to set `auth_user_id`, `accepted_at`, `status='active'`.
- [ ] Coach roster (`/coach/athletes`) lists athletes grouped by status.
- [ ] Coach detail (`/coach/athletes/[id]`) renders.
- [ ] Direct invite (`/coach/athletes/invite`) creates an `athletes` row + sends invite without a join request.
- [ ] Coach dashboard (`/coach`) shows accurate counts that link to the relevant pages.
- [ ] All unit + e2e tests pass.
- [ ] No new lint or typecheck errors.
- [ ] No service-role secret reaches the client (search for `SUPABASE_SERVICE_ROLE_KEY` in any file under `app/` that isn't a server action or route handler — should be zero hits).

---

## Known limitations to log for V1

These are deliberate and tracked for follow-up; do NOT widen the plan to address them:

- **No captcha / rate limiting on `/request-to-join`.** Plan 2.5 follow-up.
- **Magic-link email uses Supabase's default sender.** Plan 2.5 will configure Supabase SMTP → Resend so the magic-link email matches the Vault aesthetic.
- **No email to coach when a new request arrives.** Coach checks in-app. Plan 2.5 can add Resend notification.
- **No "resend invite" button** on the roster for invited-but-not-accepted athletes. Workaround: re-use direct invite — `inviteAthlete` is idempotent for non-active rows. Add explicit UI in Plan 4 settings.
- **No bulk invite.** Single-athlete invites only. Plan 5 if needed.
- **No "decline reason" capture or notification email.** Plan 2.5 if William wants to communicate decisions.

---

## Notes for the executor

- After every task, run `pnpm typecheck && pnpm lint && pnpm test` before committing — catch breakage early.
- Use the existing patterns from Plan 1: `createClient` from `lib/supabase/server.ts` for RSCs, `createAdminClient` from `lib/supabase/admin.ts` ONLY in server actions / route handlers and only after `assertCoach()`.
- Vault aesthetic tokens are in `app/globals.css` via `@theme`. Stick to existing tokens — `text-bone`, `text-bone-muted`, `text-bone-faint`, `text-gold`, `bg-ink-950`, `bg-ink-900`, `border-hairline`, `border-hairline-strong`. Don't introduce new colors without coordinating with the operator.
- All forms use server actions + `useActionState`. Don't reach for tanstack-query, react-hook-form, or any other client form lib.
- Append a session-log entry to `.session-logs/session-<date>.md` after every meaningful task (see memory `feedback_session_logs.md`).
