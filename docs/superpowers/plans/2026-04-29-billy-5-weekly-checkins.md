# Plan 5 — Weekly Check-ins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Ship weekly check-ins for athletes — symmetric to Plan 4's workout logger but for whole-week bodyweight + readiness signals.

**Architecture:** New `check_ins` table, server-derived `week_starting` (Monday-anchored), athlete CRUD on own / coach SELECT for own athletes. Single `/app/check-in` page with form + last-6-weeks history.

**Tech Stack:** Next.js 16, Supabase, Zod, Tailwind v4, Vitest, Playwright. No new deps.

**Spec:** `docs/superpowers/specs/2026-04-29-billy-plan-5-weekly-checkins-design.md`.

**Working dir:** `C:\Users\van\Desktop\billy`. Prefix shell with `cd "/c/Users/van/Desktop/billy" &&`.

**Builds on:** Plans 1-4 + 3b. Reuses `auth_athlete_id()`, `auth_coach_id()`, `getCurrentAthlete`, `getCurrentCoach`, `computeTodayDay`.

---

## File map

| Path | Purpose |
|---|---|
| `supabase/migrations/0012_check_ins.sql` | New. check_ins table + RLS + updated_at trigger. |
| `lib/check-ins/schemas.ts` | New. Zod schemas. |
| `lib/check-ins/breadcrumbs.ts` | New. Sentry breadcrumb helpers. |
| `lib/check-ins/week-starting.ts` | New. Pure helper computing Monday-anchored `week_starting` from any date. |
| `lib/check-ins/get-current-week.ts` | New. Returns current week's check-in (or null) + the computed week_starting string. |
| `lib/check-ins/list-own-recent.ts` | New. Athlete-side history fetcher. |
| `lib/check-ins/list-recent.ts` | New. Coach-side history fetcher (param: athleteId). |
| `lib/check-ins/actions/save-check-in.ts` | New. `saveCheckIn` upsert action. |
| `app/app/check-in/page.tsx` | New. Athlete page (form + history). |
| `app/app/check-in/check-in-form.tsx` | New. Client component with bodyweight input + 4 sliders + textareas + save. |
| `app/app/page.tsx` | Modify. Add Check-in card. |
| `app/coach/athletes/[id]/page.tsx` | Modify. Add Recent check-ins section. |
| `tests/unit/check-ins/week-starting.test.ts` | New. |
| `tests/unit/check-ins/schemas.test.ts` | New. |
| `tests/integration/check-ins/rls.test.ts` | New. |
| `tests/e2e/check-ins/submit-and-coach-sees.spec.ts` | New. |
| `tests/e2e/check-ins/edit-current-week.spec.ts` | New. |

---

## Pre-flight

- [ ] **PF-1.** Confirm baseline:

```bash
cd "/c/Users/van/Desktop/billy" && pnpm exec supabase status | head -3 && git status --short && pnpm typecheck && pnpm test 2>&1 | tail -3 && pnpm test:e2e 2>&1 | tail -3
```

Expected: Supabase up, tree clean (only gitignored), typecheck clean, vitest 91/91, e2e 19/19.

If anything fails on baseline, surface to user before starting Task 1.

---

## Task 1: Migration 0012 + RLS integration test (TDD)

**Files:**
- Create: `supabase/migrations/0012_check_ins.sql`
- Create: `tests/integration/check-ins/rls.test.ts`

### Step 1: Failing RLS test

Create `tests/integration/check-ins/rls.test.ts` (mirrors `tests/integration/workouts/rls.test.ts` shape with 6 cases):

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const admin = createClient(URL, SR, { auth: { persistSession: false } });

async function makeUserClient(email: string) {
  const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
  await admin.auth.admin.updateUserById(created.user!.id, { password: 'TestPass123!' });
  const c = createClient(URL, ANON, {
    auth: { persistSession: false, storageKey: `sb-test-${created.user!.id}` },
  });
  await c.auth.signInWithPassword({ email, password: 'TestPass123!' });
  return { client: c, userId: created.user!.id };
}

describe('RLS — check_ins', () => {
  let athleteAClient: SupabaseClient;
  let athleteBClient: SupabaseClient;
  let coachAClient: SupabaseClient;
  let coachBClient: SupabaseClient;
  let checkInAId: string;
  let athleteAId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const cA = await makeUserClient(`coach-ci-A-${ts}@test.local`);
    const cB = await makeUserClient(`coach-ci-B-${ts}@test.local`);
    const aA = await makeUserClient(`ath-ci-A-${ts}@test.local`);
    const aB = await makeUserClient(`ath-ci-B-${ts}@test.local`);
    coachAClient = cA.client; coachBClient = cB.client;
    athleteAClient = aA.client; athleteBClient = aB.client;

    const cArow = await admin.from('coaches').insert({
      auth_user_id: cA.userId, display_name: 'A', email: `coach-ci-A-${ts}@test.local`,
    }).select('id').single();
    const cBrow = await admin.from('coaches').insert({
      auth_user_id: cB.userId, display_name: 'B', email: `coach-ci-B-${ts}@test.local`,
    }).select('id').single();
    const aArow = await admin.from('athletes').insert({
      coach_id: cArow.data!.id, auth_user_id: aA.userId,
      name: 'A', email: `ath-ci-A-${ts}@test.local`, is_active: true,
    }).select('id').single();
    athleteAId = aArow.data!.id;
    await admin.from('athletes').insert({
      coach_id: cBrow.data!.id, auth_user_id: aB.userId,
      name: 'B', email: `ath-ci-B-${ts}@test.local`, is_active: true,
    });

    const ci = await admin.from('check_ins').insert({
      athlete_id: athleteAId, week_starting: '2026-04-27',
      bodyweight_lbs: 200, fatigue: 5, soreness: 4, confidence: 7, motivation: 8,
    }).select('id').single();
    checkInAId = ci.data!.id;
  });

  it('athlete A SELECTs own check-in', async () => {
    const { data } = await athleteAClient.from('check_ins').select('id').eq('id', checkInAId);
    expect(data?.length).toBe(1);
  });

  it('athlete B cannot SELECT athlete A check-in', async () => {
    const { data } = await athleteBClient.from('check_ins').select('id').eq('id', checkInAId);
    expect(data).toEqual([]);
  });

  it('coach A SELECTs athlete A check-in', async () => {
    const { data } = await coachAClient.from('check_ins').select('id').eq('id', checkInAId);
    expect(data?.length).toBe(1);
  });

  it('coach B cannot SELECT athlete A check-in', async () => {
    const { data } = await coachBClient.from('check_ins').select('id').eq('id', checkInAId);
    expect(data).toEqual([]);
  });

  it('coach A cannot UPDATE athlete A check-in', async () => {
    const { data } = await coachAClient.from('check_ins')
      .update({ comments: 'coach wrote' }).eq('id', checkInAId).select();
    expect(data ?? []).toEqual([]);
  });

  it('UNIQUE (athlete_id, week_starting) prevents duplicates', async () => {
    const { error } = await admin.from('check_ins').insert({
      athlete_id: athleteAId, week_starting: '2026-04-27',
      bodyweight_lbs: 201, fatigue: 5, soreness: 4, confidence: 7, motivation: 8,
    });
    expect(error).toBeTruthy();
  });
});
```

### Step 2: Run test (red)

```bash
cd "/c/Users/van/Desktop/billy" && pnpm vitest run tests/integration/check-ins/rls.test.ts
```

Expected: fails because table doesn't exist.

### Step 3: Migration

Create `supabase/migrations/0012_check_ins.sql`:

```sql
-- Plan 5 Task 1: check_ins table for weekly athlete check-ins.

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  week_starting date not null,
  bodyweight_lbs numeric not null check (bodyweight_lbs > 0 and bodyweight_lbs < 1000),
  fatigue integer not null check (fatigue between 1 and 10),
  soreness integer not null check (soreness between 1 and 10),
  confidence integer not null check (confidence between 1 and 10),
  motivation integer not null check (motivation between 1 and 10),
  meet_readiness integer check (meet_readiness is null or meet_readiness between 1 and 10),
  pain_notes text,
  comments text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, week_starting)
);
create index check_ins_athlete_id_idx on public.check_ins(athlete_id);

create or replace function public.bump_check_ins_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger check_ins_bump_updated_at
  before update on public.check_ins
  for each row execute function public.bump_check_ins_updated_at();

alter table public.check_ins enable row level security;

create policy check_ins_athlete_select on public.check_ins
  for select using (athlete_id = public.auth_athlete_id());
create policy check_ins_athlete_insert on public.check_ins
  for insert with check (athlete_id = public.auth_athlete_id());
create policy check_ins_athlete_update on public.check_ins
  for update using (athlete_id = public.auth_athlete_id())
  with check (athlete_id = public.auth_athlete_id());
create policy check_ins_athlete_delete on public.check_ins
  for delete using (athlete_id = public.auth_athlete_id());

create policy check_ins_coach_select on public.check_ins
  for select using (athlete_id in (
    select id from public.athletes where coach_id = public.auth_coach_id()
  ));
```

### Step 4: Apply + re-run (green)

```bash
cd "/c/Users/van/Desktop/billy" && pnpm exec supabase db reset && pnpm vitest run tests/integration/check-ins/rls.test.ts
```

Expected: 6/6 pass. (If Kong DNS hiccup, `docker restart supabase_kong_plan-1-foundation`.)

### Step 5: Full suite

```bash
cd "/c/Users/van/Desktop/billy" && pnpm test 2>&1 | tail -3
```

Expected: 91 + 6 = 97 passing.

### Step 6: Commit

```bash
cd "/c/Users/van/Desktop/billy" && git add supabase/migrations/0012_check_ins.sql tests/integration/check-ins/rls.test.ts && git commit -m "feat(check-ins): check_ins table + RLS

Plan 5 Task 1. Athletes CRUD own check-ins; coaches SELECT for their
athletes' check-ins. UNIQUE (athlete_id, week_starting) enforces one
check-in per week. updated_at trigger.

Verified: 6/6 RLS tests, full suite 97/97.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Schemas + week-starting helper + unit tests

**Files:**
- Create: `lib/check-ins/schemas.ts`
- Create: `lib/check-ins/breadcrumbs.ts`
- Create: `lib/check-ins/week-starting.ts`
- Create: `tests/unit/check-ins/week-starting.test.ts`
- Create: `tests/unit/check-ins/schemas.test.ts`

### `lib/check-ins/schemas.ts`

```ts
import { z } from 'zod';

export const saveCheckInSchema = z.object({
  bodyweightLbs: z.number().min(50).max(700),
  fatigue: z.number().int().min(1).max(10),
  soreness: z.number().int().min(1).max(10),
  confidence: z.number().int().min(1).max(10),
  motivation: z.number().int().min(1).max(10),
  meetReadiness: z.number().int().min(1).max(10).optional().nullable(),
  painNotes: z.string().max(2000).optional().nullable(),
  comments: z.string().max(2000).optional().nullable(),
});
export type SaveCheckInInput = z.infer<typeof saveCheckInSchema>;
```

### `lib/check-ins/breadcrumbs.ts`

```ts
import * as Sentry from '@sentry/nextjs';

type CheckInEventType = 'checkin.submitted' | 'checkin.updated';

export function checkInBreadcrumb(type: CheckInEventType, data: Record<string, unknown>) {
  Sentry.addBreadcrumb({
    category: 'check-ins',
    type,
    level: 'info',
    data: { event: type, ...data },
    timestamp: Date.now() / 1000,
  });
}
```

### `lib/check-ins/week-starting.ts`

```ts
/**
 * Pure helper: given any date, return the Monday of that week as 'YYYY-MM-DD'.
 * Monday-anchored (matches Plan 3b's computeTodayDay where Monday=1).
 * UTC-anchored to avoid DST/locale surprises.
 */
export function computeWeekStarting(today: string): string {
  const t = new Date(`${today}T00:00:00Z`);
  const dow = t.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const offset = dow === 0 ? 6 : dow - 1; // days back to Monday
  t.setUTCDate(t.getUTCDate() - offset);
  return t.toISOString().slice(0, 10);
}
```

### Unit tests

`tests/unit/check-ins/week-starting.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeWeekStarting } from '@/lib/check-ins/week-starting';

describe('computeWeekStarting', () => {
  it('Monday → that Monday', () => {
    expect(computeWeekStarting('2026-04-27')).toBe('2026-04-27');
  });
  it('Tuesday → previous Monday', () => {
    expect(computeWeekStarting('2026-04-28')).toBe('2026-04-27');
  });
  it('Wednesday → previous Monday', () => {
    expect(computeWeekStarting('2026-04-29')).toBe('2026-04-27');
  });
  it('Sunday → previous Monday', () => {
    expect(computeWeekStarting('2026-05-03')).toBe('2026-04-27');
  });
  it('first Monday of next week → that Monday', () => {
    expect(computeWeekStarting('2026-05-04')).toBe('2026-05-04');
  });
});
```

`tests/unit/check-ins/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { saveCheckInSchema } from '@/lib/check-ins/schemas';

describe('saveCheckInSchema', () => {
  it('accepts valid full payload', () => {
    const r = saveCheckInSchema.safeParse({
      bodyweightLbs: 198, fatigue: 5, soreness: 4, confidence: 7, motivation: 8,
      meetReadiness: 6, painNotes: 'mild left knee', comments: 'felt strong',
    });
    expect(r.success).toBe(true);
  });
  it('rejects bodyweight below 50 lb', () => {
    const r = saveCheckInSchema.safeParse({
      bodyweightLbs: 30, fatigue: 5, soreness: 4, confidence: 7, motivation: 8,
    });
    expect(r.success).toBe(false);
  });
  it('rejects fatigue=11', () => {
    const r = saveCheckInSchema.safeParse({
      bodyweightLbs: 200, fatigue: 11, soreness: 4, confidence: 7, motivation: 8,
    });
    expect(r.success).toBe(false);
  });
  it('accepts minimal required', () => {
    const r = saveCheckInSchema.safeParse({
      bodyweightLbs: 200, fatigue: 5, soreness: 4, confidence: 7, motivation: 8,
    });
    expect(r.success).toBe(true);
  });
});
```

### Verify + commit

```bash
cd "/c/Users/van/Desktop/billy" && pnpm vitest run tests/unit/check-ins/ && pnpm typecheck && pnpm test 2>&1 | tail -3
```

Expected: 5 + 4 = 9 unit tests pass, suite 97 + 9 = 106.

```bash
cd "/c/Users/van/Desktop/billy" && git add lib/check-ins/schemas.ts lib/check-ins/breadcrumbs.ts lib/check-ins/week-starting.ts tests/unit/check-ins && git commit -m "feat(check-ins): schemas + breadcrumbs + week-starting helper

Plan 5 Task 2. Zod schema for saveCheckIn (4 required 1-10 fields,
bodyweight 50-700 lb, optional pain/meet/comments). UTC Monday-anchored
week_starting helper (mirrors Plan 3b's computeTodayDay). Sentry
breadcrumb helper.

Verified: 9 unit tests, suite 106/106.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Server actions + fetchers

**Files:**
- Create: `lib/check-ins/get-current-week.ts`
- Create: `lib/check-ins/list-own-recent.ts`
- Create: `lib/check-ins/list-recent.ts`
- Create: `lib/check-ins/actions/save-check-in.ts`

### `get-current-week.ts`

```ts
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { computeWeekStarting } from './week-starting';

export type CheckInRow = {
  id: string;
  weekStarting: string;
  bodyweightLbs: number;
  fatigue: number;
  soreness: number;
  confidence: number;
  motivation: number;
  meetReadiness: number | null;
  painNotes: string | null;
  comments: string | null;
  submittedAt: string;
  updatedAt: string;
};

export async function getCurrentWeekCheckIn(): Promise<{ checkIn: CheckInRow | null; weekStarting: string }> {
  const athlete = await getCurrentAthlete();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const weekStarting = computeWeekStarting(today);

  const { data } = await supabase
    .from('check_ins')
    .select('id, week_starting, bodyweight_lbs, fatigue, soreness, confidence, motivation, meet_readiness, pain_notes, comments, submitted_at, updated_at')
    .eq('athlete_id', athlete.id)
    .eq('week_starting', weekStarting)
    .maybeSingle();

  if (!data) return { checkIn: null, weekStarting };
  return {
    checkIn: {
      id: data.id, weekStarting: data.week_starting,
      bodyweightLbs: data.bodyweight_lbs, fatigue: data.fatigue, soreness: data.soreness,
      confidence: data.confidence, motivation: data.motivation,
      meetReadiness: data.meet_readiness, painNotes: data.pain_notes, comments: data.comments,
      submittedAt: data.submitted_at, updatedAt: data.updated_at,
    },
    weekStarting,
  };
}
```

### `list-own-recent.ts`

```ts
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import type { CheckInRow } from './get-current-week';

export async function listOwnRecentCheckIns(limit = 6): Promise<CheckInRow[]> {
  await getCurrentAthlete();
  const supabase = await createClient();
  const { data = [] } = await supabase
    .from('check_ins')
    .select('id, week_starting, bodyweight_lbs, fatigue, soreness, confidence, motivation, meet_readiness, pain_notes, comments, submitted_at, updated_at')
    .order('week_starting', { ascending: false })
    .limit(limit);
  return (data ?? []).map((d) => ({
    id: d.id, weekStarting: d.week_starting,
    bodyweightLbs: d.bodyweight_lbs, fatigue: d.fatigue, soreness: d.soreness,
    confidence: d.confidence, motivation: d.motivation,
    meetReadiness: d.meet_readiness, painNotes: d.pain_notes, comments: d.comments,
    submittedAt: d.submitted_at, updatedAt: d.updated_at,
  }));
}
```

### `list-recent.ts`

```ts
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';
import type { CheckInRow } from './get-current-week';

export async function listRecentCheckIns(athleteId: string, limit = 6): Promise<CheckInRow[]> {
  await getCurrentCoach();
  const supabase = await createClient();
  const { data = [] } = await supabase
    .from('check_ins')
    .select('id, week_starting, bodyweight_lbs, fatigue, soreness, confidence, motivation, meet_readiness, pain_notes, comments, submitted_at, updated_at')
    .eq('athlete_id', athleteId)
    .order('week_starting', { ascending: false })
    .limit(limit);
  return (data ?? []).map((d) => ({
    id: d.id, weekStarting: d.week_starting,
    bodyweightLbs: d.bodyweight_lbs, fatigue: d.fatigue, soreness: d.soreness,
    confidence: d.confidence, motivation: d.motivation,
    meetReadiness: d.meet_readiness, painNotes: d.pain_notes, comments: d.comments,
    submittedAt: d.submitted_at, updatedAt: d.updated_at,
  }));
}
```

### `actions/save-check-in.ts`

```ts
'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { saveCheckInSchema } from '../schemas';
import { computeWeekStarting } from '../week-starting';
import { checkInBreadcrumb } from '../breadcrumbs';

const GENERIC_DB_ERROR = 'Failed to save check-in. Please try again.';

function mask(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`saveCheckIn.${operation}: ${error.message}`));
  return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
}

export async function saveCheckIn(input: unknown) {
  const p = saveCheckInSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  const athlete = await getCurrentAthlete();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const weekStarting = computeWeekStarting(today);

  const { data: existing } = await supabase
    .from('check_ins')
    .select('id')
    .eq('athlete_id', athlete.id)
    .eq('week_starting', weekStarting)
    .maybeSingle();

  const payload = {
    athlete_id: athlete.id,
    week_starting: weekStarting,
    bodyweight_lbs: p.data.bodyweightLbs,
    fatigue: p.data.fatigue, soreness: p.data.soreness,
    confidence: p.data.confidence, motivation: p.data.motivation,
    meet_readiness: p.data.meetReadiness ?? null,
    pain_notes: p.data.painNotes ?? null,
    comments: p.data.comments ?? null,
  };

  if (existing) {
    const { error } = await supabase.from('check_ins').update(payload).eq('id', existing.id);
    if (error) return mask('update', error);
    checkInBreadcrumb('checkin.updated', { check_in_id: existing.id, week_starting: weekStarting });
    return { ok: true as const, checkInId: existing.id };
  } else {
    const { data, error } = await supabase.from('check_ins').insert(payload).select('id').single();
    if (error || !data) return mask('insert', error ?? { message: 'no row' });
    checkInBreadcrumb('checkin.submitted', { check_in_id: data.id, week_starting: weekStarting });
    return { ok: true as const, checkInId: data.id };
  }
}
```

### Verify + commit

```bash
cd "/c/Users/van/Desktop/billy" && pnpm typecheck && pnpm test 2>&1 | tail -3
cd "/c/Users/van/Desktop/billy" && git add lib/check-ins && git commit -m "feat(check-ins): server actions + fetchers

Plan 5 Task 3. saveCheckIn upsert with server-derived week_starting.
Reads existing for the current week → UPDATE if present, INSERT
otherwise. Sentry breadcrumbs for submitted vs updated. listOwnRecent
(athlete history, RLS-scoped) and listRecent (coach query for an
athlete, RLS-scoped via auth_coach_id). getCurrentWeekCheckIn returns
the current week's check-in (or null) plus the week_starting string.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: /app/check-in page + form

**Files:**
- Create: `app/app/check-in/page.tsx`
- Create: `app/app/check-in/check-in-form.tsx`

### `page.tsx`

```tsx
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { getCurrentWeekCheckIn } from '@/lib/check-ins/get-current-week';
import { listOwnRecentCheckIns } from '@/lib/check-ins/list-own-recent';
import { CheckInForm } from './check-in-form';

export const metadata = { title: 'Check-in · Steele & Co.' };

export default async function CheckInPage() {
  const athlete = await getCurrentAthlete();
  const { checkIn, weekStarting } = await getCurrentWeekCheckIn();
  const recent = await listOwnRecentCheckIns(6);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">Week of {weekStarting}</p>
        <h1 className="text-bone font-serif text-3xl">Weekly check-in</h1>
        <p className="text-bone-muted mt-2 text-sm">
          {checkIn ? `Last saved ${new Date(checkIn.updatedAt).toLocaleString()}` : 'Submit your numbers for this week.'}
        </p>
      </header>

      <CheckInForm initial={checkIn} />

      {recent.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-bone-muted text-xs tracking-widest uppercase">Past check-ins</h2>
          <ul className="border-hairline-strong border bg-[#16140f] divide-y divide-[#1a1814]">
            {recent.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-bone-faint text-xs">Week of {c.weekStarting}</p>
                  <p className="text-bone-faint text-xs">{c.bodyweightLbs} lb</p>
                </div>
                <p className="text-bone tabular-nums mt-1 text-sm">
                  Fatigue {c.fatigue} · Soreness {c.soreness} · Confidence {c.confidence} · Motivation {c.motivation}
                  {c.meetReadiness != null && ` · Meet ${c.meetReadiness}`}
                </p>
                {c.painNotes && <p className="text-rose-400/80 mt-1 text-xs">Pain: {c.painNotes.slice(0, 100)}</p>}
                {c.comments && <p className="text-bone-muted mt-1 text-xs">{c.comments.slice(0, 120)}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
```

### `check-in-form.tsx`

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveCheckIn } from '@/lib/check-ins/actions/save-check-in';
import type { CheckInRow } from '@/lib/check-ins/get-current-week';

const METRICS = [
  { key: 'fatigue', label: 'Fatigue', sub: '1 = fresh · 10 = wrecked' },
  { key: 'soreness', label: 'Soreness', sub: '1 = none · 10 = severe' },
  { key: 'confidence', label: 'Confidence', sub: '1 = shaken · 10 = locked in' },
  { key: 'motivation', label: 'Motivation', sub: '1 = flat · 10 = ready to go' },
] as const;

export function CheckInForm({ initial }: { initial: CheckInRow | null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [bodyweight, setBodyweight] = useState(initial?.bodyweightLbs.toString() ?? '');
  const [fatigue, setFatigue] = useState(initial?.fatigue ?? 5);
  const [soreness, setSoreness] = useState(initial?.soreness ?? 5);
  const [confidence, setConfidence] = useState(initial?.confidence ?? 5);
  const [motivation, setMotivation] = useState(initial?.motivation ?? 5);
  const [meetReadiness, setMeetReadiness] = useState<number | null>(initial?.meetReadiness ?? null);
  const [painNotes, setPainNotes] = useState(initial?.painNotes ?? '');
  const [comments, setComments] = useState(initial?.comments ?? '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        setSavingState('saving');
        startTransition(async () => {
          const r = await saveCheckIn({
            bodyweightLbs: Number(bodyweight),
            fatigue, soreness, confidence, motivation,
            meetReadiness,
            painNotes: painNotes || null,
            comments: comments || null,
          });
          if ((r as { ok: boolean }).ok === false) {
            setSavingState('error');
            setErr((r as { message?: string }).message ?? 'Save failed');
            return;
          }
          setSavingState('saved');
          setTimeout(() => setSavingState('idle'), 1500);
          router.refresh();
        });
      }}
      className="flex flex-col gap-6"
    >
      <Field label="Bodyweight (lb)">
        <input type="number" inputMode="decimal" required min={50} max={700} step="0.1"
          value={bodyweight} onChange={(e) => setBodyweight(e.target.value)}
          className="border-hairline-strong w-32 border bg-transparent px-3 py-2 text-bone outline-none focus:border-gold/60" />
      </Field>

      {METRICS.map(({ key, label, sub }) => {
        const value =
          key === 'fatigue' ? fatigue :
          key === 'soreness' ? soreness :
          key === 'confidence' ? confidence :
          motivation;
        const setter =
          key === 'fatigue' ? setFatigue :
          key === 'soreness' ? setSoreness :
          key === 'confidence' ? setConfidence :
          setMotivation;
        return (
          <div key={key} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-bone-muted text-xs tracking-widest uppercase">{label}</span>
              <span className="text-gold font-serif text-2xl tabular-nums">{value}</span>
            </div>
            <input type="range" min={1} max={10} step={1} value={value}
              onChange={(e) => setter(Number(e.target.value))}
              className="accent-gold w-full" aria-label={label} />
            <p className="text-bone-faint text-xs">{sub}</p>
          </div>
        );
      })}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-bone-muted text-xs tracking-widest uppercase">Meet readiness <span className="text-bone-faint normal-case">(optional)</span></span>
          <span className="text-gold font-serif text-2xl tabular-nums">{meetReadiness ?? '—'}</span>
        </div>
        <input type="range" min={0} max={10} step={1} value={meetReadiness ?? 0}
          onChange={(e) => {
            const v = Number(e.target.value);
            setMeetReadiness(v === 0 ? null : v);
          }}
          className="accent-gold w-full" aria-label="Meet readiness" />
        <p className="text-bone-faint text-xs">Slide to 0 to leave blank if not in meet prep.</p>
      </div>

      <Field label="Pain notes (optional)">
        <textarea maxLength={2000} value={painNotes} onChange={(e) => setPainNotes(e.target.value)}
          className="border-hairline-strong h-20 w-full border bg-transparent px-3 py-2 text-bone outline-none focus:border-gold/60" />
      </Field>

      <Field label="General comments (optional)">
        <textarea maxLength={2000} value={comments} onChange={(e) => setComments(e.target.value)}
          className="border-hairline-strong h-24 w-full border bg-transparent px-3 py-2 text-bone outline-none focus:border-gold/60" />
      </Field>

      {err && <p className="text-rose-400 text-sm">{err}</p>}

      <div className="flex items-center gap-4">
        <button type="submit" disabled={savingState === 'saving'}
          className="border-gold text-gold border px-8 py-3 text-xs tracking-widest uppercase disabled:opacity-50">
          {savingState === 'saving' ? 'Saving…' : initial ? 'Update check-in' : 'Submit check-in'}
        </button>
        {savingState === 'saved' && <p className="text-gold text-xs tracking-widest uppercase">✓ Saved</p>}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-bone-muted text-xs tracking-widest uppercase">{label}</span>
      {children}
    </label>
  );
}
```

### Verify + commit

```bash
cd "/c/Users/van/Desktop/billy" && pnpm typecheck && pnpm test 2>&1 | tail -3
cd "/c/Users/van/Desktop/billy" && git add app/app/check-in && git commit -m "feat(check-ins): /app/check-in page + form

Plan 5 Task 4. Athlete-side weekly check-in page. Bodyweight numeric
input + 4 1-10 range sliders (fatigue, soreness, confidence,
motivation) with current value shown in gold above each. Optional
meet-readiness slider (slide to 0 = leave blank). Optional pain notes
+ general comments textareas. Submit/Update button morphs based on
existing-this-week. Past 6 weeks shown as compact summary cards below.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: /app dashboard Check-in card

**File:** Modify `app/app/page.tsx`.

Read the existing file. After the existing `getActiveProgram()` data fetch and the `completedDayIds` computation, add:

```tsx
import { getCurrentWeekCheckIn } from '@/lib/check-ins/get-current-week';
// ...
const { checkIn: currentCheckIn, weekStarting: ciWeekStarting } = await getCurrentWeekCheckIn();
```

Insert a new section in the JSX **after** the "Today" section but **before** the "This week" section:

```tsx
<section className="border-hairline-strong border bg-[#16140f] p-6">
  <p className="text-gold text-xs tracking-widest uppercase">Check-in</p>
  {currentCheckIn ? (
    <>
      <h2 className="text-bone mt-2 font-serif text-2xl">✓ Checked in</h2>
      <p className="text-bone-muted mt-2 text-sm">Week of {ciWeekStarting}</p>
      <Link href="/app/check-in" className="text-gold mt-3 inline-block text-xs tracking-widest uppercase">
        Review / edit →
      </Link>
    </>
  ) : (
    <>
      <h2 className="text-bone mt-2 font-serif text-2xl">This week's check-in</h2>
      <p className="text-bone-muted mt-2 text-sm">Bodyweight + fatigue/soreness/confidence/motivation. Takes 30 seconds.</p>
      <Link href="/app/check-in"
        className="border-gold text-gold mt-4 inline-block border px-6 py-2 text-xs tracking-widest uppercase">
        Submit check-in →
      </Link>
    </>
  )}
</section>
```

Add "Check-in" to the layout nav as well — modify `app/app/layout.tsx` to include a Check-in link between "Program" and "Sign out":

```tsx
<Link href="/app/check-in" className="text-bone-muted hover:text-bone">Check-in</Link>
```

### Verify + commit

```bash
cd "/c/Users/van/Desktop/billy" && pnpm typecheck && pnpm test 2>&1 | tail -3
cd "/c/Users/van/Desktop/billy" && git add app/app/page.tsx app/app/layout.tsx && git commit -m "feat(check-ins): /app dashboard Check-in card + nav link

Plan 5 Task 5. Adds the Check-in card to /app between Today and This
Week. Renders 'Submit check-in' CTA if no row exists for this Monday,
or '✓ Checked in / Review or edit' if one does. Athlete-side layout
nav now has Today / Program / Check-in / Sign out.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Coach side — Recent check-ins on athlete detail

**File:** Modify `app/coach/athletes/[id]/page.tsx`.

Add import + fetch + section. After the existing `recentLogs` fetch (from Plan 4), add:

```tsx
import { listRecentCheckIns } from '@/lib/check-ins/list-recent';
// ...
const recentCheckIns = await listRecentCheckIns(athleteId, 6);
```

Insert a new section AFTER the "Recent workouts" section:

```tsx
<section className="flex flex-col gap-3">
  <h2 className="text-bone-muted text-xs tracking-widest uppercase">Recent check-ins</h2>
  {recentCheckIns.length === 0 ? (
    <p className="text-bone-faint text-sm">No check-ins yet.</p>
  ) : (
    <ul className="border-hairline-strong border bg-[#16140f] divide-y divide-[#1a1814]">
      {recentCheckIns.map((c) => (
        <li key={c.id} className="px-4 py-3">
          <div className="flex items-baseline justify-between">
            <p className="text-bone-faint text-xs">Week of {c.weekStarting}</p>
            <p className="text-bone-faint text-xs">{c.bodyweightLbs} lb</p>
          </div>
          <p className="text-bone tabular-nums mt-1 text-sm">
            Fatigue {c.fatigue} · Soreness {c.soreness} · Confidence {c.confidence} · Motivation {c.motivation}
            {c.meetReadiness != null && ` · Meet ${c.meetReadiness}`}
          </p>
          {c.painNotes && <p className="text-rose-400/80 mt-1 text-xs">Pain: {c.painNotes.slice(0, 100)}</p>}
          {c.comments && <p className="text-bone-muted mt-1 text-xs">{c.comments.slice(0, 120)}</p>}
        </li>
      ))}
    </ul>
  )}
</section>
```

### Verify + commit

```bash
cd "/c/Users/van/Desktop/billy" && pnpm typecheck && pnpm test 2>&1 | tail -3
cd "/c/Users/van/Desktop/billy" && git add app/coach/athletes/\[id\]/page.tsx && git commit -m "feat(check-ins): coach sees Recent check-ins on athlete detail

Plan 5 Task 6. Adds a Recent check-ins section below Recent workouts on
/coach/athletes/[id]. Last 6 entries with metrics + pain (rose) +
comments excerpts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: E2E suite

**Files:**
- Create: `tests/e2e/check-ins/submit-and-coach-sees.spec.ts`
- Create: `tests/e2e/check-ins/edit-current-week.spec.ts`

Reuses `seedAthleteUser`, `signInAsAthlete` from athlete-session helper.

### `submit-and-coach-sees.spec.ts`

```ts
import { test, expect } from '@playwright/test';
import { ensureCoachAndLogin } from '../helpers/coach-session';
import { seedAthleteUser, signInAsAthlete } from '../helpers/athlete-session';

test('athlete submits check-in, coach sees it on the athlete detail page', async ({ context }) => {
  const ts = Date.now();
  const email = `ath-ci-${ts}@e2e.local`;
  const { athleteId } = await seedAthleteUser(email);

  // Athlete fills + submits.
  const aPage = await signInAsAthlete(context, email);
  await aPage.goto('/app/check-in');
  await aPage.getByLabel(/Bodyweight/i).fill('200');
  // Sliders default to 5 — that's fine.
  await aPage.getByLabel(/Pain notes/i).fill('mild left knee tweak');
  await aPage.getByRole('button', { name: /Submit check-in/i }).click();
  await expect(aPage.getByText(/Saved/i)).toBeVisible({ timeout: 5000 });

  // Coach signs in (separate context for clean state) + verifies.
  await ensureCoachAndLogin(context);
  const cPage = await context.newPage();
  await cPage.goto(`/coach/athletes/${athleteId}`);
  await expect(cPage.getByText(/Recent check-ins/i)).toBeVisible();
  await expect(cPage.getByText(/200 lb/i)).toBeVisible();
  await expect(cPage.getByText(/mild left knee/i)).toBeVisible();
});
```

### `edit-current-week.spec.ts`

```ts
import { test, expect } from '@playwright/test';
import { seedAthleteUser, signInAsAthlete } from '../helpers/athlete-session';

test('athlete can edit the current week\'s check-in', async ({ context }) => {
  const ts = Date.now();
  const email = `ath-edit-${ts}@e2e.local`;
  await seedAthleteUser(email);

  const page = await signInAsAthlete(context, email);
  await page.goto('/app/check-in');
  await page.getByLabel(/Bodyweight/i).fill('199.5');
  await page.getByRole('button', { name: /Submit check-in/i }).click();
  await expect(page.getByText(/Saved/i)).toBeVisible({ timeout: 5000 });

  // Reload — bodyweight should be pre-filled, button morphs to "Update check-in".
  await page.reload();
  await expect(page.getByDisplayValue('199.5')).toBeVisible();
  await expect(page.getByRole('button', { name: /Update check-in/i })).toBeVisible();

  // Edit + re-save.
  await page.getByLabel(/Bodyweight/i).fill('200');
  await page.getByRole('button', { name: /Update check-in/i }).click();
  await expect(page.getByText(/Saved/i)).toBeVisible({ timeout: 5000 });
});
```

### Run + commit

```bash
cd "/c/Users/van/Desktop/billy" && pnpm test:e2e 2>&1 | tail -10
```

Expected: 19 (existing) + 2 (new) = 21 passing.

```bash
cd "/c/Users/van/Desktop/billy" && git add tests/e2e/check-ins && git commit -m "test(check-ins): e2e for athlete-submits-coach-sees + edit-current-week

Plan 5 Task 7. Two e2e specs covering:
- Athlete submits check-in via /app/check-in form, sees Saved confirmation,
  coach signs in and finds the entry on the athlete detail page
- Athlete reloads the form: pre-filled, button morphs to 'Update'; edit
  and re-save works

Verified: 21/21 e2e tests passing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Final gates + push

```bash
cd "/c/Users/van/Desktop/billy" && pnpm exec supabase db reset
cd "/c/Users/van/Desktop/billy" && pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

Expected: typecheck clean · lint 0 errors / ≤2 pre-existing warnings · vitest 91+15 = 106 · e2e 19+2 = 21.

Verify clean tree, push, append session-log entry.

---

## Self-review

- Athlete submits a check-in and sees ✓ on /app
- Athlete returns to /app/check-in, fields pre-filled, button morphs to "Update", edit works
- Past weeks show in the history list below the form
- Coach sees Recent check-ins on athlete detail
- RLS isolation across athletes + coaches verified
- UNIQUE prevents duplicate-week submissions
- Server-derived week_starting (not client-supplied)

---

## Known limitations

- Sunday 8am reminder cron — separate plan
- Low-readiness coach dashboard alert — Plan 6
- Meet readiness conditional render — Plan 3.5
- kg/lb toggle — V1.5
- Past-week edit — V1.5 (athletes can only edit current week today)
