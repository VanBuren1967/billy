# Plan 3b — Athlete Program Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the athlete-side program viewer — `/app` dashboard + `/app/program` full week-by-week tree — so athletes can see programs William assigns them. Read-only; Plan 4 adds workout logging on top.

**Architecture:** Server-component-first Next.js 16 with App Router. New athlete-side RLS SELECT policies on programs/program_days/program_exercises. New `lib/athletes/get-current-athlete.ts` helper mirroring `getCurrentCoach`. Single-query data fetch for the program tree. Mobile-first viewer styled with the existing Vault tokens.

**Tech Stack:** Next.js 16, Supabase (Postgres + auth + RLS), Tailwind v4, Vitest, Playwright. No new npm dependencies.

**Spec reference:** `docs/superpowers/specs/2026-04-28-billy-plan-3b-athlete-viewer-design.md`.

**Working directory:** `C:\Users\van\Desktop\billy`. Shell commands prefixed with `cd "/c/Users/van/Desktop/billy" &&` (cwd resets between commands).

**Builds on:** Plan 1 (foundation + auth + middleware role gate at `proxy.ts`), Plan 2 (athletes table + invite flow), Plan 3 (programs subsystem — coach side, shipped).

---

## Out of scope

- Workout logging (`workout_logs`, `set_logs`) → Plan 4.
- Athlete profile metadata fields (`weight_class`, `current_squat_max`, etc.) → Plan 3.5.
- Onboarding wizard, check-ins, donations, progress charts → later plans.
- Multiple-concurrent-active-program switcher → V1.5+.

---

## File map

| Path | Purpose |
|---|---|
| `supabase/migrations/0010_programs_athlete_select_rls.sql` | New. `auth_athlete_id()` helper + 3 SELECT-only policies for athletes. |
| `lib/athletes/get-current-athlete.ts` | New. Server-side helper resolving `auth.uid()` → athletes row. Throws on non-athlete. |
| `lib/athletes/program-time.ts` | New. Pure helpers: `computeCurrentWeek(startDate, today, totalWeeks)`, `computeTodayDay(today, weekStartsOn)`. |
| `lib/athletes/get-active-program.ts` | New. Fetches the athlete's active assigned program tree (program + days + exercises) via RLS-scoped SELECT. |
| `app/app/layout.tsx` | New. Athlete-side layout shell with minimal top nav. |
| `app/app/page.tsx` | New. Dashboard. Shows active program summary + Today's Workout card + this-week list. Empty state if no program. |
| `app/app/program/page.tsx` | New. Full week-by-week read-only viewer. |
| `app/app/program/program-tree.tsx` | New. Client component for collapsible week sections (no editing — pure display). |
| `app/auth/callback/route.ts` | Modify if needed. Verify athlete role-based redirect lands on `/app`. |
| `tests/unit/athletes/program-time.test.ts` | New. Unit tests for `computeCurrentWeek` + `computeTodayDay`. |
| `tests/integration/athletes/program-rls.test.ts` | New. RLS isolation across athletes + cross-coach. |
| `tests/e2e/athletes/sign-in-and-view.spec.ts` | New. E2E: athlete signs in, lands at /app, sees program. |
| `tests/e2e/athletes/view-program.spec.ts` | New. E2E: athlete views /app/program full tree, expands/collapses weeks. |
| `tests/e2e/athletes/empty-state.spec.ts` | New. E2E: athlete with no assigned program sees empty state. |
| `tests/e2e/helpers/athlete-session.ts` | New. Mirror of `coach-session.ts` for an athlete persona. |

---

## Pre-flight

- [ ] **PF-1.** Confirm Supabase up + working tree clean:

```bash
cd "/c/Users/van/Desktop/billy" && pnpm exec supabase status | head -5 && git status --short
```

Expected: 4 URLs reported, tree clean (only gitignored items).

- [ ] **PF-2.** Confirm baseline tests + typecheck:

```bash
cd "/c/Users/van/Desktop/billy" && pnpm typecheck && pnpm test
```

Expected: typecheck passes, 55/55 tests pass.

```bash
cd "/c/Users/van/Desktop/billy" && pnpm test:e2e
```

Expected: 13/13 e2e pass.

If any gate fails on baseline, stop and surface to user before starting Task 1.

- [ ] **PF-3.** Verify the existing `getUserRole` helper covers the athlete role:

```bash
cd "/c/Users/van/Desktop/billy" && grep -n "athlete" lib/auth/get-user-role.ts | head -10
```

Expected: existing logic returns `{ kind: 'athlete', ... }` for users whose `athletes.auth_user_id = auth.uid()`. If the helper needs extension, that's part of Task 6.

---

## Task 1: Migration 0010 — athlete RLS + integration test

**Files:**
- Create: `supabase/migrations/0010_programs_athlete_select_rls.sql`
- Create: `tests/integration/athletes/program-rls.test.ts`

TDD: write the failing RLS test first, then add the migration to make it pass.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/athletes/program-rls.test.ts`:

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

describe('RLS — athlete program viewer SELECT policies', () => {
  let athleteAClient: SupabaseClient;
  let athleteBClient: SupabaseClient;
  let coachClient: SupabaseClient;
  let athleteAProgramId: string;
  let athleteBProgramId: string;
  let coachTemplateId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const coach = await makeUserClient(`coach-vp-${ts}@test.local`);
    const aA = await makeUserClient(`athlete-a-vp-${ts}@test.local`);
    const aB = await makeUserClient(`athlete-b-vp-${ts}@test.local`);
    coachClient = coach.client;
    athleteAClient = aA.client;
    athleteBClient = aB.client;

    // Coach + 2 athletes.
    const c = await admin.from('coaches').insert({
      auth_user_id: coach.userId, display_name: 'Coach', email: `coach-vp-${ts}@test.local`,
    }).select('id').single();
    const aARow = await admin.from('athletes').insert({
      coach_id: c.data!.id, auth_user_id: aA.userId,
      name: 'A', email: `athlete-a-vp-${ts}@test.local`, is_active: true,
    }).select('id').single();
    const aBRow = await admin.from('athletes').insert({
      coach_id: c.data!.id, auth_user_id: aB.userId,
      name: 'B', email: `athlete-b-vp-${ts}@test.local`, is_active: true,
    }).select('id').single();

    // Two assigned programs (one per athlete) + one template.
    const pA = await admin.from('programs').insert({
      coach_id: c.data!.id, athlete_id: aARow.data!.id, name: 'A program',
      block_type: 'general', total_weeks: 1, is_template: false,
    }).select('id').single();
    athleteAProgramId = pA.data!.id;
    const pB = await admin.from('programs').insert({
      coach_id: c.data!.id, athlete_id: aBRow.data!.id, name: 'B program',
      block_type: 'general', total_weeks: 1, is_template: false,
    }).select('id').single();
    athleteBProgramId = pB.data!.id;
    const tpl = await admin.from('programs').insert({
      coach_id: c.data!.id, name: 'Template', block_type: 'general', total_weeks: 1, is_template: true,
    }).select('id').single();
    coachTemplateId = tpl.data!.id;
  });

  it('athlete A SELECTs their own program', async () => {
    const { data } = await athleteAClient.from('programs').select('id').eq('id', athleteAProgramId);
    expect(data?.length).toBe(1);
  });

  it('athlete A cannot SELECT athlete B\'s program', async () => {
    const { data } = await athleteAClient.from('programs').select('id').eq('id', athleteBProgramId);
    expect(data).toEqual([]);
  });

  it('athlete A cannot SELECT any template', async () => {
    const { data } = await athleteAClient.from('programs').select('id').eq('id', coachTemplateId);
    expect(data).toEqual([]);
  });

  it('athlete A cannot INSERT a program', async () => {
    // Need a coach_id to attempt — fetch via the admin since athletes can't read coaches.
    const { data: coachRow } = await admin.from('coaches').select('id').limit(1).single();
    const { error } = await athleteAClient.from('programs').insert({
      coach_id: coachRow!.id, name: 'spoof', block_type: 'general', total_weeks: 1,
    });
    expect(error).toBeTruthy();
  });

  it('athlete A cannot UPDATE their own program', async () => {
    const { data, error } = await athleteAClient.from('programs')
      .update({ name: 'hijacked' }).eq('id', athleteAProgramId).select();
    expect(data ?? []).toEqual([]);
    // Either error or empty result depending on policy shape — both are acceptable refusals.
  });

  it('coach can still SELECT all their own programs (no regression)', async () => {
    const { data } = await coachClient.from('programs').select('id');
    expect(data?.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test (red)**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm vitest run tests/integration/athletes/program-rls.test.ts
```

Expected: tests fail because there's no athlete SELECT policy yet, so athlete clients see empty results across the board (including their own program).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0010_programs_athlete_select_rls.sql`:

```sql
-- Plan 3b — Programs subsystem RLS extension for athletes. Athletes can
-- SELECT their own assigned programs (and the days/exercises under them).
-- No INSERT/UPDATE/DELETE for athletes; the viewer is read-only.

create or replace function public.auth_athlete_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from public.athletes where auth_user_id = auth.uid()
$$;

grant execute on function public.auth_athlete_id() to authenticated;

-- programs: athlete reads their own assigned program(s) only. Templates excluded.
create policy programs_athlete_select on public.programs
  for select using (
    athlete_id = public.auth_athlete_id() and is_template = false
  );

create policy program_days_athlete_select on public.program_days
  for select using (program_id in (
    select id from public.programs
    where athlete_id = public.auth_athlete_id() and is_template = false
  ));

create policy program_exercises_athlete_select on public.program_exercises
  for select using (program_day_id in (
    select pd.id from public.program_days pd
      join public.programs p on p.id = pd.program_id
    where p.athlete_id = public.auth_athlete_id() and p.is_template = false
  ));
```

- [ ] **Step 4: Apply migration + re-run tests (green)**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm exec supabase db reset
cd "/c/Users/van/Desktop/billy" && pnpm vitest run tests/integration/athletes/program-rls.test.ts
```

Expected: 6/6 pass.

- [ ] **Step 5: Verify full suite still passes**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm test
```

Expected: 55 (existing) + 6 (new) = 61 passing.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/van/Desktop/billy" && git add supabase/migrations/0010_programs_athlete_select_rls.sql tests/integration/athletes/program-rls.test.ts && git commit -m "feat(athletes): RLS SELECT policies for athlete program viewer

Plan 3b Task 1. New auth_athlete_id() helper + SELECT-only policies on
programs/program_days/program_exercises keyed on athletes.id with
is_template=false filter. No INSERT/UPDATE/DELETE policies for athletes;
the viewer is read-only by design.

Verified: tests/integration/athletes/program-rls.test.ts — 6/6.
Full suite 61/61.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: getCurrentAthlete helper + program-time utilities

**Files:**
- Create: `lib/athletes/get-current-athlete.ts`
- Create: `lib/athletes/program-time.ts`
- Create: `tests/unit/athletes/program-time.test.ts`

- [ ] **Step 1: Implement `getCurrentAthlete`**

Create `lib/athletes/get-current-athlete.ts` (mirrors `lib/programs/get-current-coach.ts`):

```ts
import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type CurrentAthlete = {
  authUserId: string;
  id: string;
  name: string;
  coachId: string;
};

/**
 * Resolve the current authenticated user → their athletes row.
 *
 * Throws on:
 * - unauthenticated (no auth.uid())
 * - authenticated but no matching athletes row (e.g. a coach trying to hit /app)
 *
 * RLS independently blocks any cross-athlete read attempted by a misconfigured
 * caller.
 */
export async function getCurrentAthlete(): Promise<CurrentAthlete> {
  const supabase = await createClient();
  const { data: userRes, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    throw new Error(`auth_lookup_failed: ${authErr.message}`);
  }
  if (!userRes?.user) {
    throw new Error('unauthenticated');
  }
  const { data: athlete, error } = await supabase
    .from('athletes')
    .select('id, name, coach_id')
    .eq('auth_user_id', userRes.user.id)
    .maybeSingle();
  if (error) {
    throw new Error(`athlete_lookup_failed: ${error.message}`);
  }
  if (!athlete) {
    throw new Error('not_an_athlete');
  }
  return {
    authUserId: userRes.user.id,
    id: athlete.id,
    name: athlete.name,
    coachId: athlete.coach_id,
  };
}
```

- [ ] **Step 2: Write program-time unit test (red)**

Create `tests/unit/athletes/program-time.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeCurrentWeek, computeTodayDay } from '@/lib/athletes/program-time';

describe('computeCurrentWeek', () => {
  it('returns 1 on the start date', () => {
    expect(computeCurrentWeek('2026-05-04', '2026-05-04', 4)).toBe(1);
  });

  it('returns 1 on day 6 of week 1', () => {
    expect(computeCurrentWeek('2026-05-04', '2026-05-09', 4)).toBe(1);
  });

  it('returns 2 on day 8 (start of week 2)', () => {
    expect(computeCurrentWeek('2026-05-04', '2026-05-11', 4)).toBe(2);
  });

  it('returns 3 on day 15', () => {
    expect(computeCurrentWeek('2026-05-04', '2026-05-18', 4)).toBe(3);
  });

  it('caps at totalWeeks', () => {
    expect(computeCurrentWeek('2026-05-04', '2026-06-30', 4)).toBe(4);
  });

  it('returns 1 when startDate is null', () => {
    expect(computeCurrentWeek(null, '2026-05-04', 4)).toBe(1);
  });

  it('returns 1 when today is before startDate', () => {
    expect(computeCurrentWeek('2026-05-04', '2026-05-01', 4)).toBe(1);
  });
});

describe('computeTodayDay', () => {
  it('Monday → Day 1', () => {
    expect(computeTodayDay('2026-05-04')).toBe(1); // 2026-05-04 is a Monday
  });

  it('Tuesday → Day 2', () => {
    expect(computeTodayDay('2026-05-05')).toBe(2);
  });

  it('Sunday → Day 7', () => {
    expect(computeTodayDay('2026-05-10')).toBe(7);
  });
});
```

Run it — expect failure on import.

```bash
cd "/c/Users/van/Desktop/billy" && pnpm vitest run tests/unit/athletes/program-time.test.ts
```

- [ ] **Step 3: Implement `program-time.ts`**

Create `lib/athletes/program-time.ts`:

```ts
/**
 * Pure date helpers for the athlete program viewer. UTC-anchored to avoid
 * DST / locale surprises.
 */

/**
 * Compute the current program week (1-indexed) given the program's start_date,
 * today's date, and total_weeks. Returns 1 when:
 * - startDate is null (program hasn't been formally scheduled yet)
 * - today is before startDate (program hasn't started)
 *
 * Caps at totalWeeks once the program is past its scheduled end.
 *
 * Both inputs are 'YYYY-MM-DD' strings. Internal math is UTC-day-based.
 */
export function computeCurrentWeek(
  startDate: string | null,
  today: string,
  totalWeeks: number,
): number {
  if (!startDate) return 1;
  const start = Date.UTC(
    Number(startDate.slice(0, 4)),
    Number(startDate.slice(5, 7)) - 1,
    Number(startDate.slice(8, 10)),
  );
  const t = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  );
  if (t < start) return 1;
  const daysSinceStart = Math.floor((t - start) / (24 * 60 * 60 * 1000));
  const week = Math.floor(daysSinceStart / 7) + 1;
  return Math.min(week, totalWeeks);
}

/**
 * Compute today's day-of-week as a 1-indexed value where Monday = 1, Sunday = 7.
 * Input is a 'YYYY-MM-DD' string; treated as UTC.
 */
export function computeTodayDay(today: string): number {
  const t = new Date(`${today}T00:00:00Z`);
  const dow = t.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  return dow === 0 ? 7 : dow;
}
```

- [ ] **Step 4: Run tests (green) + typecheck**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm vitest run tests/unit/athletes/program-time.test.ts
cd "/c/Users/van/Desktop/billy" && pnpm typecheck
```

Expected: 10/10 unit tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/van/Desktop/billy" && git add lib/athletes/get-current-athlete.ts lib/athletes/program-time.ts tests/unit/athletes/program-time.test.ts && git commit -m "feat(athletes): getCurrentAthlete helper + program-time utilities

Plan 3b Task 2. getCurrentAthlete mirrors getCurrentCoach: resolves
auth.uid() to the athletes row, throws on unauthenticated/non-athlete.
program-time.ts: pure UTC-anchored helpers for computing the current
week (1..totalWeeks, capped) and today's day-of-week (Monday=1, Sunday=7).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: getActiveProgram fetcher

**Files:**
- Create: `lib/athletes/get-active-program.ts`

- [ ] **Step 1: Implement**

Create `lib/athletes/get-active-program.ts`:

```ts
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from './get-current-athlete';

export type ActiveProgramTree = {
  program: {
    id: string;
    name: string;
    blockType: 'hypertrophy' | 'strength' | 'peak' | 'general';
    totalWeeks: number;
    startDate: string | null;
    endDate: string | null;
    notes: string | null;
    isActive: boolean;
  };
  days: {
    id: string;
    weekNumber: number;
    dayNumber: number;
    name: string;
    notes: string | null;
  }[];
  exercises: {
    id: string;
    programDayId: string;
    position: number;
    name: string;
    sets: number;
    reps: string;
    loadPct: number | null;
    loadLbs: number | null;
    rpe: number | null;
    groupLabel: string | null;
    notes: string | null;
  }[];
};

/**
 * Fetch the athlete's currently-active assigned program tree (program + days +
 * exercises). Returns null if no active program is assigned.
 *
 * "Active" = is_template=false AND is_active=true AND athlete_id = me.
 * Multiple actives → most recently created wins.
 */
export async function getActiveProgram(): Promise<ActiveProgramTree | null> {
  await getCurrentAthlete(); // throws on non-athlete
  const supabase = await createClient();

  const { data: programs } = await supabase
    .from('programs')
    .select('id, name, block_type, total_weeks, start_date, end_date, notes, is_active')
    .eq('is_template', false)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!programs || programs.length === 0) return null;
  const program = programs[0]!;

  const { data: days = [] } = await supabase
    .from('program_days')
    .select('id, week_number, day_number, name, notes')
    .eq('program_id', program.id)
    .order('week_number')
    .order('day_number');

  const dayIds = (days ?? []).map((d) => d.id);
  let exercises: ActiveProgramTree['exercises'] = [];
  if (dayIds.length > 0) {
    const { data = [] } = await supabase
      .from('program_exercises')
      .select('id, program_day_id, position, name, sets, reps, load_pct, load_lbs, rpe, group_label, notes')
      .in('program_day_id', dayIds)
      .order('group_label', { ascending: true, nullsFirst: false })
      .order('position');
    exercises = (data ?? []).map((e) => ({
      id: e.id, programDayId: e.program_day_id, position: e.position, name: e.name,
      sets: e.sets, reps: e.reps, loadPct: e.load_pct, loadLbs: e.load_lbs,
      rpe: e.rpe, groupLabel: e.group_label, notes: e.notes,
    }));
  }

  return {
    program: {
      id: program.id, name: program.name,
      blockType: program.block_type as ActiveProgramTree['program']['blockType'],
      totalWeeks: program.total_weeks,
      startDate: program.start_date, endDate: program.end_date,
      notes: program.notes, isActive: program.is_active,
    },
    days: (days ?? []).map((d) => ({
      id: d.id, weekNumber: d.week_number, dayNumber: d.day_number,
      name: d.name, notes: d.notes,
    })),
    exercises,
  };
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm typecheck
cd "/c/Users/van/Desktop/billy" && git add lib/athletes/get-active-program.ts && git commit -m "feat(athletes): getActiveProgram fetcher

Plan 3b Task 3. Single function that returns the athlete's currently-
active assigned program tree (program + days + exercises) under their
RLS scope. Returns null if no active program is assigned. Multiple
actives → most recent wins.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: /app layout + dashboard

**Files:**
- Create: `app/app/layout.tsx`
- Create: `app/app/page.tsx`

- [ ] **Step 1: Layout**

Create `app/app/layout.tsx`:

```tsx
import Link from 'next/link';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#080808]">
      <nav className="border-hairline-strong border-b">
        <div className="mx-auto flex max-w-5xl items-baseline justify-between px-6 py-4">
          <Link href="/app" className="text-bone font-serif text-xl">
            Steele &amp; Co.
          </Link>
          <div className="flex items-center gap-6 text-xs uppercase tracking-widest">
            <Link href="/app" className="text-bone-muted hover:text-bone">Today</Link>
            <Link href="/app/program" className="text-bone-muted hover:text-bone">Program</Link>
            <Link href="/auth/sign-out" className="text-bone-faint hover:text-bone-muted">Sign out</Link>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Dashboard page**

Create `app/app/page.tsx`:

```tsx
import Link from 'next/link';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { getActiveProgram } from '@/lib/athletes/get-active-program';
import { computeCurrentWeek, computeTodayDay } from '@/lib/athletes/program-time';

export const metadata = { title: 'Today · Steele & Co.' };

export default async function AppDashboard() {
  const athlete = await getCurrentAthlete();
  const tree = await getActiveProgram();

  if (!tree) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16 text-center">
        <p className="text-gold text-xs tracking-widest uppercase">Welcome, {athlete.name}</p>
        <h1 className="text-bone font-serif text-3xl">No program assigned yet</h1>
        <p className="text-bone-muted">Your coach hasn&rsquo;t assigned you a program yet. Check back soon.</p>
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const currentWeek = computeCurrentWeek(tree.program.startDate, today, tree.program.totalWeeks);
  const todayDay = computeTodayDay(today);

  const todaysWorkout = tree.days.find(
    (d) => d.weekNumber === currentWeek && d.dayNumber === todayDay,
  );
  const thisWeekDays = tree.days
    .filter((d) => d.weekNumber === currentWeek)
    .sort((a, b) => a.dayNumber - b.dayNumber);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">Welcome back, {athlete.name}</p>
        <h1 className="text-bone font-serif text-3xl">{tree.program.name}</h1>
        <p className="text-bone-muted mt-2 text-xs">
          Week {currentWeek} of {tree.program.totalWeeks} · {tree.program.blockType}
        </p>
      </header>

      <section className="border-hairline-strong border bg-[#0c0c0c] p-6">
        <p className="text-gold text-xs tracking-widest uppercase">Today</p>
        {todaysWorkout ? (
          <>
            <h2 className="text-bone mt-2 font-serif text-2xl">{todaysWorkout.name}</h2>
            <p className="text-bone-muted mt-2 text-sm">
              {tree.exercises.filter((e) => e.programDayId === todaysWorkout.id).length} exercises
            </p>
            <Link href="/app/program" className="text-gold mt-4 inline-block text-xs tracking-widest uppercase">
              View today&rsquo;s workout →
            </Link>
          </>
        ) : (
          <>
            <h2 className="text-bone mt-2 font-serif text-2xl">Rest day</h2>
            <p className="text-bone-muted mt-2 text-sm">
              No workout scheduled today. Recover well.
            </p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-bone-muted text-xs tracking-widest uppercase">This week</h2>
        <ul className="border-hairline-strong border divide-y divide-[#1a1814]">
          {thisWeekDays.map((d) => (
            <li key={d.id} className="flex items-baseline justify-between px-5 py-3">
              <div>
                <p className="text-bone-faint text-xs">Day {d.dayNumber}</p>
                <p className="text-bone font-serif text-lg">{d.name}</p>
              </div>
              {d.dayNumber === todayDay && (
                <span className="text-gold text-xs tracking-widest uppercase">Today</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Link
        href="/app/program"
        className="border-gold text-gold border self-start px-6 py-3 text-xs tracking-widest uppercase"
      >
        View full program
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: Smoke test**

Start dev server in another terminal: `pnpm dev`. Sign in as `alex@demo.local` (the seeded athlete) — wait, athletes don't have auth users in the seed. Use the seed script's coach for testing (Van) won't work either since she's a coach.

For the e2e helper to work in Task 7, we'll seed an athlete with auth user. For manual smoke now: skip and rely on integration test from Task 1 + e2e in Task 7.

- [ ] **Step 4: Typecheck + commit**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm typecheck
cd "/c/Users/van/Desktop/billy" && git add app/app/layout.tsx app/app/page.tsx && git commit -m "feat(athletes): /app layout + dashboard with Today's Workout card

Plan 3b Task 4. Athlete-side layout with minimal nav (Today, Program,
Sign out). Dashboard shows: welcome banner with athlete name + active
program name + current week, Today's Workout card (or 'Rest day' if
nothing scheduled), this-week list with Today highlighted. Empty state
for athletes with no assigned program.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: /app/program full viewer

**Files:**
- Create: `app/app/program/page.tsx`
- Create: `app/app/program/program-tree.tsx`

- [ ] **Step 1: Server page**

Create `app/app/program/page.tsx`:

```tsx
import Link from 'next/link';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { getActiveProgram } from '@/lib/athletes/get-active-program';
import { computeCurrentWeek } from '@/lib/athletes/program-time';
import { ProgramTree } from './program-tree';

export const metadata = { title: 'Program · Steele & Co.' };

export default async function ProgramPage() {
  await getCurrentAthlete();
  const tree = await getActiveProgram();

  if (!tree) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16 text-center">
        <h1 className="text-bone font-serif text-3xl">No program assigned yet</h1>
        <p className="text-bone-muted">Your coach hasn&rsquo;t assigned you a program yet.</p>
        <Link href="/app" className="text-gold mt-2 text-xs tracking-widest uppercase">
          ← Back to dashboard
        </Link>
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const currentWeek = computeCurrentWeek(tree.program.startDate, today, tree.program.totalWeeks);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <p className="text-gold text-xs tracking-widest uppercase">{tree.program.blockType}</p>
        <h1 className="text-bone font-serif text-3xl">{tree.program.name}</h1>
        <p className="text-bone-muted text-xs">
          {tree.program.totalWeeks} weeks
          {tree.program.startDate && ` · starts ${tree.program.startDate}`}
        </p>
      </header>
      <ProgramTree tree={tree} currentWeek={currentWeek} />
    </main>
  );
}
```

- [ ] **Step 2: Client tree component**

Create `app/app/program/program-tree.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { ActiveProgramTree } from '@/lib/athletes/get-active-program';

export function ProgramTree({
  tree, currentWeek,
}: { tree: ActiveProgramTree; currentWeek: number }) {
  const weeks = Array.from(new Set(tree.days.map((d) => d.weekNumber))).sort((a, b) => a - b);
  const [open, setOpen] = useState<Set<number>>(new Set([currentWeek]));

  if (weeks.length === 0) {
    return (
      <p className="text-bone-muted">No weeks yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {weeks.map((wk) => {
        const isOpen = open.has(wk);
        const isCurrent = wk === currentWeek;
        const isPast = wk < currentWeek;
        const daysInWeek = tree.days
          .filter((d) => d.weekNumber === wk)
          .sort((a, b) => a.dayNumber - b.dayNumber);
        return (
          <section
            key={wk}
            className={`border ${isCurrent ? 'border-gold' : 'border-hairline-strong'} ${isPast ? 'opacity-60' : ''}`}
          >
            <button
              type="button"
              className="flex w-full items-baseline justify-between px-5 py-3 text-left"
              onClick={() =>
                setOpen((s) => {
                  const next = new Set(s);
                  if (next.has(wk)) next.delete(wk);
                  else next.add(wk);
                  return next;
                })
              }
            >
              <span className={`font-serif text-xl ${isCurrent ? 'text-gold' : 'text-bone'}`}>
                Week {wk}
                {isCurrent && <span className="ml-2 text-xs tracking-widest uppercase">Current</span>}
              </span>
              <span className="text-bone-faint text-xs">
                {daysInWeek.length} {daysInWeek.length === 1 ? 'day' : 'days'} {isOpen ? '▾' : '▸'}
              </span>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-3 border-t border-[#1f1d18] px-5 py-4">
                {daysInWeek.map((d) => (
                  <DayCard
                    key={d.id}
                    day={d}
                    exercises={tree.exercises.filter((e) => e.programDayId === d.id)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DayCard({
  day, exercises,
}: {
  day: ActiveProgramTree['days'][number];
  exercises: ActiveProgramTree['exercises'];
}) {
  return (
    <article className="border-l-2 border-[#1f1d18] pl-4">
      <header>
        <h3 className="text-bone font-serif text-lg">
          Day {day.dayNumber} — {day.name}
        </h3>
      </header>
      {exercises.length === 0 ? (
        <p className="text-bone-faint mt-2 text-xs">No exercises programmed for this day.</p>
      ) : (
        <table className="text-bone mt-3 w-full text-sm tabular-nums">
          <thead>
            <tr className="text-bone-faint border-b border-[#1f1d18] text-xs uppercase">
              <th className="py-1 text-left font-normal">Block</th>
              <th className="py-1 text-left font-normal">Exercise</th>
              <th className="py-1 text-left font-normal">Sets×Reps</th>
              <th className="py-1 text-left font-normal">Load</th>
              <th className="py-1 text-left font-normal">RPE</th>
            </tr>
          </thead>
          <tbody>
            {exercises.map((e) => (
              <tr key={e.id} className="border-b border-[#1a1814]/40">
                <td className="py-1.5 text-gold">
                  {e.groupLabel ?? <span className="text-bone-faint">—</span>}
                </td>
                <td className="py-1.5">{e.name}</td>
                <td className="py-1.5">{e.sets}×{e.reps}</td>
                <td className="py-1.5">
                  {e.loadPct != null ? `${e.loadPct}%` : e.loadLbs != null ? `${e.loadLbs} lb` : '—'}
                </td>
                <td className="py-1.5">{e.rpe ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm typecheck
cd "/c/Users/van/Desktop/billy" && git add app/app/program && git commit -m "feat(athletes): /app/program full week-by-week read-only viewer

Plan 3b Task 5. Server-rendered page fetches the athlete's active
program tree under athlete RLS, renders ProgramTree client component
for collapsible week sections. Current week starts expanded and is
gold-bordered; past weeks are dimmed; future weeks are normal.
Read-only — no edit affordances anywhere.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Verify auth callback routes athletes correctly

**Files:**
- Read: `app/auth/callback/route.ts` (verify, modify if needed)
- Read: `lib/auth/get-user-role.ts` (verify it returns athlete role)

- [ ] **Step 1: Inspect existing callback**

```bash
cd "/c/Users/van/Desktop/billy" && cat app/auth/callback/route.ts
cd "/c/Users/van/Desktop/billy" && cat lib/auth/get-user-role.ts
```

The existing callback should already route based on role. Verify it sends athletes to `/app` and coaches to `/coach`. If it does, no changes needed for this task — proceed to Step 3.

If it does NOT correctly route athletes (e.g., it always lands at `/coach` or always `/`), then update the callback to use `getUserRole()` and dispatch:
- `coach` → `/coach`
- `athlete` → `/app`
- otherwise → `/login?error=account_not_yet_linked`

- [ ] **Step 2: If updates were needed, commit**

If the callback was correct as-is, skip the commit — annotate the task as DONE_NO_CHANGES_NEEDED.

If updates were applied:

```bash
cd "/c/Users/van/Desktop/billy" && git add app/auth/callback/route.ts && git commit -m "fix(auth): callback routes athletes to /app and coaches to /coach

Plan 3b Task 6. Verified the auth callback handles all three roles
(coach, athlete, neither) and redirects appropriately.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Manual smoke** (optional — covered by Task 7 e2e):

```bash
cd "/c/Users/van/Desktop/billy" && pnpm typecheck && pnpm test
```

Expected: 61/61 still passing.

---

## Task 7: Playwright e2e suite

**Files:**
- Create: `tests/e2e/helpers/athlete-session.ts`
- Create: `tests/e2e/athletes/sign-in-and-view.spec.ts`
- Create: `tests/e2e/athletes/view-program.spec.ts`
- Create: `tests/e2e/athletes/empty-state.spec.ts`

- [ ] **Step 1: Athlete session helper**

Create `tests/e2e/helpers/athlete-session.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { type BrowserContext, expect } from '@playwright/test';
import { clearInbucket } from './inbucket';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';

function adminClient() {
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, sk, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Ensure an athlete with the given email is created and linked to a coach.
 * Creates the auth user, the coach (if needed), and the athletes row.
 * Returns athlete + coach IDs for subsequent seeding.
 */
export async function seedAthleteUser(
  athleteEmail: string,
  coachEmail = 'coach+e2e@example.com',
) {
  const admin = adminClient();

  // Coach: reuse the e2e coach
  const { data: coachUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let coachUser = coachUsers?.users.find((u) => u.email === coachEmail);
  if (!coachUser) {
    const { data } = await admin.auth.admin.createUser({ email: coachEmail, email_confirm: true });
    coachUser = data.user!;
  }
  let { data: coach } = await admin
    .from('coaches').select('id').eq('auth_user_id', coachUser.id).maybeSingle();
  if (!coach) {
    const { data } = await admin.from('coaches').insert({
      auth_user_id: coachUser.id, display_name: 'E2E Coach', email: coachEmail,
    }).select('id').single();
    coach = data!;
  }

  // Athlete user
  const { data: athleteUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let athleteUser = athleteUsers?.users.find((u) => u.email === athleteEmail);
  if (!athleteUser) {
    const { data } = await admin.auth.admin.createUser({ email: athleteEmail, email_confirm: true });
    athleteUser = data.user!;
  }

  // Athletes row
  let { data: athleteRow } = await admin
    .from('athletes').select('id').eq('auth_user_id', athleteUser.id).maybeSingle();
  if (!athleteRow) {
    const { data } = await admin.from('athletes').insert({
      coach_id: coach!.id, auth_user_id: athleteUser.id,
      name: 'E2E Athlete', email: athleteEmail, is_active: true,
    }).select('id').single();
    athleteRow = data!;
  }

  return { coachId: coach!.id, athleteId: athleteRow!.id, athleteEmail };
}

/**
 * Sign in an athlete via the real /login form + Inbucket magic link.
 * Returns the same page with an authenticated athlete session.
 */
export async function signInAsAthlete(context: BrowserContext, email: string) {
  await clearInbucket(email);
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByPlaceholder('you@email.com').fill(email);
  await page.getByRole('button', { name: /send link/i }).click();
  await expect(page.getByText(/link sent/i)).toBeVisible();

  // Pull the magic-link URL out of Inbucket and visit it.
  const { getMagicLinkFor } = await import('./inbucket');
  const url = await getMagicLinkFor(email);
  await page.goto(url);
  // After verify the browser ends up at /app — wait for the dashboard to load.
  await expect(page).toHaveURL(/\/app(\/.*)?$/);
  return page;
}

export async function seedAssignedProgramForAthlete(coachId: string, athleteId: string, name = 'E2E Assigned') {
  const admin = adminClient();
  const { data: prog } = await admin.from('programs').insert({
    coach_id: coachId, athlete_id: athleteId, name,
    block_type: 'general', total_weeks: 2, is_template: false,
  }).select('id').single();
  const programId = prog!.id;

  const { data: day } = await admin.from('program_days').insert({
    program_id: programId, week_number: 1, day_number: 1, name: 'Squat day',
  }).select('id').single();
  await admin.from('program_exercises').insert({
    program_day_id: day!.id, position: 1, name: 'Squat', sets: 5, reps: '5', load_pct: 75,
  });
  return { programId };
}
```

- [ ] **Step 2: sign-in-and-view spec**

Create `tests/e2e/athletes/sign-in-and-view.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedAthleteUser, signInAsAthlete, seedAssignedProgramForAthlete } from '../helpers/athlete-session';

test('athlete signs in and sees their assigned program', async ({ context }) => {
  const ts = Date.now();
  const email = `athlete-signin-${ts}@e2e.local`;
  const { coachId, athleteId } = await seedAthleteUser(email);
  await seedAssignedProgramForAthlete(coachId, athleteId, `E2E Program ${ts}`);

  const page = await signInAsAthlete(context, email);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(`E2E Program ${ts}`)).toBeVisible();
  await expect(page.getByText('Squat day')).toBeVisible();
});
```

- [ ] **Step 3: view-program spec**

Create `tests/e2e/athletes/view-program.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedAthleteUser, signInAsAthlete, seedAssignedProgramForAthlete } from '../helpers/athlete-session';

test('athlete navigates to /app/program and expands a week', async ({ context }) => {
  const ts = Date.now();
  const email = `athlete-view-${ts}@e2e.local`;
  const { coachId, athleteId } = await seedAthleteUser(email);
  await seedAssignedProgramForAthlete(coachId, athleteId, `View ${ts}`);

  const page = await signInAsAthlete(context, email);
  await page.goto('/app/program');
  await expect(page.getByText('Squat')).toBeVisible();
  // Week 1 starts expanded; Week 2 should be collapsed initially.
  // Click Week heading to toggle.
  const week2Btn = page.getByRole('button', { name: /Week 2/ });
  if (await week2Btn.count() > 0) {
    await week2Btn.click();
    // No assertion on Week 2 content (it has no days seeded), just confirm it doesn't crash.
  }
});
```

- [ ] **Step 4: empty-state spec**

Create `tests/e2e/athletes/empty-state.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedAthleteUser, signInAsAthlete } from '../helpers/athlete-session';

test('athlete with no assigned program sees the empty state', async ({ context }) => {
  const ts = Date.now();
  const email = `athlete-empty-${ts}@e2e.local`;
  await seedAthleteUser(email);
  // No program assigned.

  const page = await signInAsAthlete(context, email);
  await expect(page.getByText(/no program assigned yet/i)).toBeVisible();
});
```

- [ ] **Step 5: Run e2e suite**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm test:e2e 2>&1 | tail -20
```

Expected: 13 (existing) + 3 (new) = 16 passing. Workers=1 already pinned.

If a spec fails:
- READ the failure carefully
- Common issue: athlete sign-in flow. The `/login` form may have specific behavior for non-existent users. Verify the seed helper actually creates the user before signin.
- If the magic-link email ends up routing to `/coach` instead of `/app`, that means the auth callback role-routing (Task 6) didn't land — go fix.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/van/Desktop/billy" && git add tests/e2e/helpers/athlete-session.ts tests/e2e/athletes && git commit -m "test(athletes): playwright e2e for athlete sign-in + program view + empty state

Plan 3b Task 7. Three new e2e specs + athlete-session helper. Helper
seeds an athlete user (linked to coach+e2e@example.com), signs in via
the real /login form + Inbucket magic-link, and lands on /app. Specs:

- sign-in-and-view: athlete signs in, sees assigned program name
- view-program: athlete browses /app/program, expands week sections
- empty-state: athlete with no program sees the empty-state message

Verified: 16/16 e2e tests passing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Final gates + push

- [ ] **Step 1: Run all gates**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm exec supabase db reset
cd "/c/Users/van/Desktop/billy" && pnpm typecheck
cd "/c/Users/van/Desktop/billy" && pnpm lint
cd "/c/Users/van/Desktop/billy" && pnpm test
cd "/c/Users/van/Desktop/billy" && pnpm test:e2e
```

Expected:
- typecheck: clean
- lint: 0 errors, ≤2 pre-existing warnings (matches baseline)
- vitest: 55 (existing) + 6 (RLS) + 10 (program-time) = 71 passing
- playwright: 13 (existing) + 3 (new) = 16 passing

- [ ] **Step 2: Confirm clean tree**

```bash
cd "/c/Users/van/Desktop/billy" && git status --short
cd "/c/Users/van/Desktop/billy" && git log --oneline origin/main..HEAD
```

Expected: clean (only gitignored). Log shows the Plan 3b commits.

- [ ] **Step 3: Push to origin/main**

```bash
cd "/c/Users/van/Desktop/billy" && git push origin main
```

Plan 3b shipped.

- [ ] **Step 4: Append session log entry summarizing Plan 3b commits + final state**

(Mirrors the Plan 3 entry-3 format in `.session-logs/session-2026-04-27.md`. Create today's entry — `.session-logs/session-2026-04-28.md` if today is the 28th, etc.)

---

## Self-review checklist (run after the plan is implemented)

- [ ] Athlete signs in via magic-link, lands at `/app` (not `/coach` or `/`).
- [ ] `/app` shows active program name, current week, today's workout (or rest day), this week's days.
- [ ] `/app/program` renders the full tree, current week expanded + gold-bordered.
- [ ] Athletes can SELECT only their own programs (RLS verified).
- [ ] Athletes cannot INSERT/UPDATE/DELETE programs (no policies).
- [ ] Templates excluded from athlete view (RLS check).
- [ ] Empty state for athletes with no assigned program.
- [ ] Coach RLS unaffected (regression test).
- [ ] Lint shows 0 errors; pre-existing warning count unchanged.
- [ ] No service-role secret leaks to client code.

---

## Known limitations to log for V1

- Multiple-active-program switcher: athletes with multiple actives only see the most recent.
- Athlete profile metadata fields not yet present (Plan 3.5 will add).
- No "completed day" indicator (Plan 4 adds via workout_logs).
- Athletes can see archived programs (decision; historical reference).
- Mobile-tested on Chrome desktop simulator only; real-device QA is a polish task.

---

## Notes for the executor

- Run `pnpm typecheck && pnpm test` after each task before committing.
- If the auth callback's role-based routing was already correct in Plan 1's foundation (Task 6 step 1), no changes are needed for Task 6 — annotate as DONE_NO_CHANGES_NEEDED.
- The integration tests for Task 1 will accumulate test-DB state; if subsequent integration tests fail mysteriously, run `pnpm exec supabase db reset` to clear.
- The e2e helper reuses `coach+e2e@example.com` for athlete coach assignment. This is intentional to keep e2e fixtures lightweight — production code does NOT depend on this email.
- After Task 8 push, append a session-log entry to `.session-logs/session-<today>.md` summarizing the commits and final state.
