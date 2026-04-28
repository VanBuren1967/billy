# Plan 4 — Workout Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the workout logging MVP. Athletes record what they actually did per set (weight, reps, RPE) with mobile-first autosave. Coaches see completed/in-progress logs on the athlete detail page. Closes the full V1 MVP loop.

**Architecture:** Server-component-first Next.js 16 with App Router. Two new tables (`workout_logs`, `set_logs`) with RLS. Athletes have full CRUD on own logs; coaches have SELECT on their athletes'. Logger client component autosaves on blur per row. No optimistic locking (rare contention).

**Tech Stack:** Next.js 16, Supabase, Zod, Tailwind v4, Vitest, Playwright. No new npm dependencies.

**Spec reference:** `docs/superpowers/specs/2026-04-28-billy-plan-4-workout-logging-design.md`.

**Working directory:** `C:\Users\van\Desktop\billy`. Shell commands prefixed with `cd "/c/Users/van/Desktop/billy" &&`.

**Builds on:** Plan 3 (programs schema + coach builder), Plan 3b (athlete viewer + auth_athlete_id helper). Reuses `lib/programs/get-current-coach.ts`, `lib/athletes/get-current-athlete.ts`, `lib/programs/breadcrumbs.ts` (extended).

---

## File map

| Path | Purpose |
|---|---|
| `supabase/migrations/0011_workout_and_set_logs.sql` | New. workout_logs + set_logs tables + RLS + updated_at triggers. |
| `lib/workouts/schemas.ts` | New. Zod schemas for save/notes/complete actions. |
| `lib/workouts/breadcrumbs.ts` | New. Sentry breadcrumb helpers (`workout.started`, `workout.set_saved`, `workout.completed`, `workout.reopened`). |
| `lib/workouts/get-or-create-workout-log.ts` | New. Idempotent fetch-or-create that pre-populates set_logs from program_exercises. |
| `lib/workouts/actions/save-set-log.ts` | New. `saveSetLog` server action. |
| `lib/workouts/actions/save-workout-notes.ts` | New. `saveWorkoutNotes`. |
| `lib/workouts/actions/mark-complete.ts` | New. `markWorkoutComplete` + `reopenWorkout`. |
| `lib/workouts/list-recent-logs.ts` | New. Coach-side query for the athlete detail page. |
| `app/app/workout/[program_day_id]/page.tsx` | New. Server-rendered logger shell. |
| `app/app/workout/[program_day_id]/workout-logger.tsx` | New. Client component for set entry, autosave, mark-complete. |
| `app/app/page.tsx` | Modify. Today card now links "Log workout" or shows "Completed". |
| `app/app/program/program-tree.tsx` | Modify. Day cards show ✓ if log is completed. |
| `app/coach/athletes/[id]/page.tsx` | Modify. Add "Recent Workouts" section. |
| `tests/unit/workouts/schemas.test.ts` | New. Zod schema tests. |
| `tests/integration/workouts/rls.test.ts` | New. RLS isolation. |
| `tests/integration/workouts/lifecycle.test.ts` | New. Idempotency + complete/reopen. |
| `tests/e2e/workouts/log-workout.spec.ts` | New. End-to-end happy path. |
| `tests/e2e/workouts/coach-sees-log.spec.ts` | New. Coach sees athlete's logged workout. |
| `tests/e2e/workouts/reopen.spec.ts` | New. Completed log can be reopened. |

---

## Pre-flight

- [ ] **PF-1.** Confirm baseline:

```bash
cd "/c/Users/van/Desktop/billy" && pnpm exec supabase status | head -3 && git status --short && pnpm typecheck && pnpm test 2>&1 | tail -3
```

Expected: all URLs reported, tree clean, typecheck clean, **71/71** tests pass.

```bash
cd "/c/Users/van/Desktop/billy" && pnpm test:e2e 2>&1 | tail -3
```

Expected: **16/16** e2e pass.

If anything fails, surface to user before starting Task 1.

---

## Task 1: Migration 0011 — workout_logs + set_logs + RLS + integration test

**Files:**
- Create: `supabase/migrations/0011_workout_and_set_logs.sql`
- Create: `tests/integration/workouts/rls.test.ts`

TDD: write the failing test, then add the migration to make it pass.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/workouts/rls.test.ts`:

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

describe('RLS — workout_logs and set_logs', () => {
  let athleteAClient: SupabaseClient;
  let athleteBClient: SupabaseClient;
  let coachAClient: SupabaseClient;
  let coachBClient: SupabaseClient;
  let logAId: string;
  let setLogAId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const cA = await makeUserClient(`coach-wl-A-${ts}@test.local`);
    const cB = await makeUserClient(`coach-wl-B-${ts}@test.local`);
    const aA = await makeUserClient(`ath-wl-A-${ts}@test.local`);
    const aB = await makeUserClient(`ath-wl-B-${ts}@test.local`);
    coachAClient = cA.client;
    coachBClient = cB.client;
    athleteAClient = aA.client;
    athleteBClient = aB.client;

    const cArow = await admin.from('coaches').insert({
      auth_user_id: cA.userId, display_name: 'A', email: `coach-wl-A-${ts}@test.local`,
    }).select('id').single();
    const cBrow = await admin.from('coaches').insert({
      auth_user_id: cB.userId, display_name: 'B', email: `coach-wl-B-${ts}@test.local`,
    }).select('id').single();
    const aArow = await admin.from('athletes').insert({
      coach_id: cArow.data!.id, auth_user_id: aA.userId,
      name: 'A', email: `ath-wl-A-${ts}@test.local`, is_active: true,
    }).select('id').single();
    const aBrow = await admin.from('athletes').insert({
      coach_id: cBrow.data!.id, auth_user_id: aB.userId,
      name: 'B', email: `ath-wl-B-${ts}@test.local`, is_active: true,
    }).select('id').single();

    // Program + day + exercise for athlete A.
    const pA = await admin.from('programs').insert({
      coach_id: cArow.data!.id, athlete_id: aArow.data!.id, name: 'A',
      block_type: 'general', total_weeks: 1, is_template: false,
    }).select('id').single();
    const dA = await admin.from('program_days').insert({
      program_id: pA.data!.id, week_number: 1, day_number: 1, name: 'Squat',
    }).select('id').single();
    const eA = await admin.from('program_exercises').insert({
      program_day_id: dA.data!.id, position: 1, name: 'Squat', sets: 3, reps: '5',
    }).select('id').single();

    // workout_log + set_log for athlete A.
    const wA = await admin.from('workout_logs').insert({
      athlete_id: aArow.data!.id, program_day_id: dA.data!.id, status: 'in_progress',
    }).select('id').single();
    logAId = wA.data!.id;

    const sA = await admin.from('set_logs').insert({
      workout_log_id: logAId, program_exercise_id: eA.data!.id, set_number: 1,
      weight_lbs: 225, reps_done: 5,
    }).select('id').single();
    setLogAId = sA.data!.id;
  });

  it('athlete A can SELECT their own workout_log', async () => {
    const { data } = await athleteAClient.from('workout_logs').select('id').eq('id', logAId);
    expect(data?.length).toBe(1);
  });

  it('athlete B cannot SELECT athlete A\'s workout_log', async () => {
    const { data } = await athleteBClient.from('workout_logs').select('id').eq('id', logAId);
    expect(data).toEqual([]);
  });

  it('athlete A can UPDATE their own workout_log', async () => {
    const { data } = await athleteAClient.from('workout_logs')
      .update({ general_notes: 'felt good' }).eq('id', logAId).select();
    expect(data?.length).toBe(1);
  });

  it('athlete B cannot UPDATE athlete A\'s workout_log', async () => {
    const { data } = await athleteBClient.from('workout_logs')
      .update({ general_notes: 'hijacked' }).eq('id', logAId).select();
    expect(data ?? []).toEqual([]);
  });

  it('coach A can SELECT athlete A\'s workout_log', async () => {
    const { data } = await coachAClient.from('workout_logs').select('id').eq('id', logAId);
    expect(data?.length).toBe(1);
  });

  it('coach B cannot SELECT athlete A\'s workout_log', async () => {
    const { data } = await coachBClient.from('workout_logs').select('id').eq('id', logAId);
    expect(data).toEqual([]);
  });

  it('coach A cannot UPDATE athlete A\'s workout_log', async () => {
    const { data } = await coachAClient.from('workout_logs')
      .update({ general_notes: 'coach wrote' }).eq('id', logAId).select();
    expect(data ?? []).toEqual([]);
  });

  it('athlete A can SELECT their own set_log', async () => {
    const { data } = await athleteAClient.from('set_logs').select('id').eq('id', setLogAId);
    expect(data?.length).toBe(1);
  });

  it('athlete B cannot SELECT athlete A\'s set_log', async () => {
    const { data } = await athleteBClient.from('set_logs').select('id').eq('id', setLogAId);
    expect(data).toEqual([]);
  });

  it('coach A can SELECT athlete A\'s set_log', async () => {
    const { data } = await coachAClient.from('set_logs').select('id').eq('id', setLogAId);
    expect(data?.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run (red)**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm vitest run tests/integration/workouts/rls.test.ts
```

Expected: tests fail because `workout_logs` and `set_logs` tables don't exist yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0011_workout_and_set_logs.sql` with EXACTLY this content:

```sql
-- Plan 4 Task 1: workout_logs + set_logs tables for athlete-side logging.
-- FK to program_day_id / program_exercise_id uses ON DELETE RESTRICT —
-- once a log exists, the coach can't hard-delete the prescription;
-- archival is the only path. Athletes own their history.

create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  program_day_id uuid not null references public.program_days(id) on delete restrict,
  status text not null default 'in_progress'
    check (status in ('in_progress','completed','skipped')),
  completed_at timestamptz,
  pain_notes text,
  general_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, program_day_id)
);
create index workout_logs_athlete_id_idx on public.workout_logs(athlete_id);
create index workout_logs_program_day_id_idx on public.workout_logs(program_day_id);

create or replace function public.bump_workout_logs_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger workout_logs_bump_updated_at
  before update on public.workout_logs
  for each row execute function public.bump_workout_logs_updated_at();

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references public.workout_logs(id) on delete cascade,
  program_exercise_id uuid not null references public.program_exercises(id) on delete restrict,
  set_number integer not null check (set_number > 0),
  weight_lbs numeric,
  reps_done integer,
  rpe numeric check (rpe is null or rpe between 0 and 10),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (workout_log_id, program_exercise_id, set_number)
);
create index set_logs_workout_log_id_idx on public.set_logs(workout_log_id);
create index set_logs_program_exercise_id_idx on public.set_logs(program_exercise_id);

create or replace function public.bump_set_logs_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger set_logs_bump_updated_at
  before update on public.set_logs
  for each row execute function public.bump_set_logs_updated_at();

-- RLS: workout_logs
alter table public.workout_logs enable row level security;

create policy workout_logs_athlete_select on public.workout_logs
  for select using (athlete_id = public.auth_athlete_id());
create policy workout_logs_athlete_insert on public.workout_logs
  for insert with check (athlete_id = public.auth_athlete_id());
create policy workout_logs_athlete_update on public.workout_logs
  for update using (athlete_id = public.auth_athlete_id())
  with check (athlete_id = public.auth_athlete_id());
create policy workout_logs_athlete_delete on public.workout_logs
  for delete using (athlete_id = public.auth_athlete_id());

create policy workout_logs_coach_select on public.workout_logs
  for select using (athlete_id in (
    select id from public.athletes where coach_id = public.auth_coach_id()
  ));

-- RLS: set_logs
alter table public.set_logs enable row level security;

create policy set_logs_athlete_select on public.set_logs
  for select using (workout_log_id in (
    select id from public.workout_logs where athlete_id = public.auth_athlete_id()
  ));
create policy set_logs_athlete_insert on public.set_logs
  for insert with check (workout_log_id in (
    select id from public.workout_logs where athlete_id = public.auth_athlete_id()
  ));
create policy set_logs_athlete_update on public.set_logs
  for update using (workout_log_id in (
    select id from public.workout_logs where athlete_id = public.auth_athlete_id()
  ))
  with check (workout_log_id in (
    select id from public.workout_logs where athlete_id = public.auth_athlete_id()
  ));
create policy set_logs_athlete_delete on public.set_logs
  for delete using (workout_log_id in (
    select id from public.workout_logs where athlete_id = public.auth_athlete_id()
  ));

create policy set_logs_coach_select on public.set_logs
  for select using (workout_log_id in (
    select wl.id from public.workout_logs wl
      join public.athletes a on a.id = wl.athlete_id
    where a.coach_id = public.auth_coach_id()
  ));
```

- [ ] **Step 4: Apply + re-run (green)**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm exec supabase db reset
cd "/c/Users/van/Desktop/billy" && pnpm vitest run tests/integration/workouts/rls.test.ts
```

Expected: 10/10 pass. If `Failed to inspect container health` appears, restart Kong: `docker restart supabase_kong_plan-1-foundation`.

- [ ] **Step 5: Full suite**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm test
```

Expected: 71 + 10 = 81 passing.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/van/Desktop/billy" && git add supabase/migrations/0011_workout_and_set_logs.sql tests/integration/workouts/rls.test.ts && git commit -m "feat(workouts): workout_logs + set_logs schema + RLS

Plan 4 Task 1. Two new tables for athlete-side workout logging:
- workout_logs: one per (athlete_id, program_day_id), status enum,
  optional notes, updated_at trigger
- set_logs: one per (workout_log_id, program_exercise_id, set_number),
  weight_lbs/reps_done/rpe, completed boolean

FK to program_day_id / program_exercise_id uses ON DELETE RESTRICT —
once logged, coach can't hard-delete the prescription. Athletes own
their history.

RLS: athletes full CRUD on own logs; coaches SELECT-only for their
athletes' logs. Verified by 10 integration tests covering both
positive cases and cross-coach / cross-athlete denials.

Verified: 10/10 RLS tests, full suite 81/81.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Zod schemas + breadcrumbs

**Files:**
- Create: `lib/workouts/schemas.ts`
- Create: `lib/workouts/breadcrumbs.ts`
- Create: `tests/unit/workouts/schemas.test.ts`

- [ ] **Step 1: Write schemas**

Create `lib/workouts/schemas.ts`:

```ts
import { z } from 'zod';

export const getOrCreateWorkoutLogSchema = z.object({
  programDayId: z.string().uuid(),
});
export type GetOrCreateWorkoutLogInput = z.infer<typeof getOrCreateWorkoutLogSchema>;

export const saveSetLogSchema = z.object({
  setLogId: z.string().uuid(),
  weightLbs: z.number().min(0).max(2500).optional().nullable(),
  repsDone: z.number().int().min(0).max(200).optional().nullable(),
  rpe: z.number().min(0).max(10).optional().nullable(),
  completed: z.boolean().optional(),
});
export type SaveSetLogInput = z.infer<typeof saveSetLogSchema>;

export const saveWorkoutNotesSchema = z.object({
  workoutLogId: z.string().uuid(),
  painNotes: z.string().max(2000).optional().nullable(),
  generalNotes: z.string().max(2000).optional().nullable(),
});
export type SaveWorkoutNotesInput = z.infer<typeof saveWorkoutNotesSchema>;

export const markWorkoutCompleteSchema = z.object({
  workoutLogId: z.string().uuid(),
});
export type MarkWorkoutCompleteInput = z.infer<typeof markWorkoutCompleteSchema>;
```

- [ ] **Step 2: Schema unit test**

Create `tests/unit/workouts/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { saveSetLogSchema, saveWorkoutNotesSchema } from '@/lib/workouts/schemas';

describe('saveSetLogSchema', () => {
  it('accepts a valid set save', () => {
    const r = saveSetLogSchema.safeParse({
      setLogId: '00000000-0000-0000-0000-000000000000',
      weightLbs: 225, repsDone: 5, rpe: 7, completed: true,
    });
    expect(r.success).toBe(true);
  });

  it('rejects rpe > 10', () => {
    const r = saveSetLogSchema.safeParse({
      setLogId: '00000000-0000-0000-0000-000000000000',
      rpe: 11,
    });
    expect(r.success).toBe(false);
  });

  it('rejects negative reps', () => {
    const r = saveSetLogSchema.safeParse({
      setLogId: '00000000-0000-0000-0000-000000000000',
      repsDone: -1,
    });
    expect(r.success).toBe(false);
  });

  it('accepts high reps (AMRAP-style)', () => {
    const r = saveSetLogSchema.safeParse({
      setLogId: '00000000-0000-0000-0000-000000000000',
      repsDone: 35,
    });
    expect(r.success).toBe(true);
  });
});

describe('saveWorkoutNotesSchema', () => {
  it('accepts both note fields', () => {
    const r = saveWorkoutNotesSchema.safeParse({
      workoutLogId: '00000000-0000-0000-0000-000000000000',
      painNotes: 'mild left knee', generalNotes: 'felt strong',
    });
    expect(r.success).toBe(true);
  });

  it('caps notes at 2000 chars', () => {
    const r = saveWorkoutNotesSchema.safeParse({
      workoutLogId: '00000000-0000-0000-0000-000000000000',
      painNotes: 'x'.repeat(2001),
    });
    expect(r.success).toBe(false);
  });
});
```

Run (red on import); then implement schemas.ts (above); then re-run (green).

- [ ] **Step 3: Breadcrumbs helper**

Create `lib/workouts/breadcrumbs.ts`:

```ts
import * as Sentry from '@sentry/nextjs';

type WorkoutEventType =
  | 'workout.started'
  | 'workout.set_saved'
  | 'workout.notes_saved'
  | 'workout.completed'
  | 'workout.reopened';

export function workoutBreadcrumb(type: WorkoutEventType, data: Record<string, unknown>) {
  Sentry.addBreadcrumb({
    category: 'workouts',
    type,
    level: 'info',
    data: { event: type, ...data },
    timestamp: Date.now() / 1000,
  });
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm vitest run tests/unit/workouts/schemas.test.ts
cd "/c/Users/van/Desktop/billy" && pnpm typecheck
cd "/c/Users/van/Desktop/billy" && pnpm test 2>&1 | tail -3
```

Expected: 6/6 schema tests, suite 81 + 6 = 87 passing.

```bash
cd "/c/Users/van/Desktop/billy" && git add lib/workouts/schemas.ts lib/workouts/breadcrumbs.ts tests/unit/workouts/schemas.test.ts && git commit -m "feat(workouts): zod schemas + sentry breadcrumb helpers

Plan 4 Task 2. Input schemas for saveSetLog, saveWorkoutNotes,
markWorkoutComplete, getOrCreateWorkoutLog. Breadcrumb helper for
workout lifecycle events (started, set_saved, completed, reopened).

Verified: 6/6 schema tests, suite 87/87.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: getOrCreateWorkoutLog helper

**Files:**
- Create: `lib/workouts/get-or-create-workout-log.ts`
- Create: `tests/integration/workouts/lifecycle.test.ts`

- [ ] **Step 1: Implement helper**

Create `lib/workouts/get-or-create-workout-log.ts`:

```ts
import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { workoutBreadcrumb } from './breadcrumbs';

export type WorkoutLogTree = {
  log: {
    id: string;
    athleteId: string;
    programDayId: string;
    status: 'in_progress' | 'completed' | 'skipped';
    completedAt: string | null;
    painNotes: string | null;
    generalNotes: string | null;
  };
  sets: {
    id: string;
    programExerciseId: string;
    setNumber: number;
    weightLbs: number | null;
    repsDone: number | null;
    rpe: number | null;
    completed: boolean;
  }[];
};

const GENERIC_DB_ERROR = 'Failed to load workout. Please try again.';

function maskDbError(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`getOrCreateWorkoutLog.${operation}: ${error.message}`));
  return new Error(GENERIC_DB_ERROR);
}

/**
 * Idempotent. If a workout_log already exists for (current athlete, programDayId),
 * returns it with all set_logs. Otherwise creates one + pre-populates set_logs
 * for every program_exercise's prescribed set count.
 *
 * Athlete must own the program_day (RLS enforces this on the SELECTs and
 * INSERTs below).
 */
export async function getOrCreateWorkoutLog(programDayId: string): Promise<WorkoutLogTree> {
  const athlete = await getCurrentAthlete();
  const supabase = await createClient();

  // Verify the program_day belongs to one of the athlete's accessible programs.
  // RLS on program_days will silently return [] otherwise.
  const { data: dayRow, error: dayErr } = await supabase
    .from('program_days')
    .select('id, program_id')
    .eq('id', programDayId)
    .maybeSingle();
  if (dayErr) throw maskDbError('day_lookup', dayErr);
  if (!dayRow) throw new Error('program_day not accessible');

  // Try to read existing log.
  const { data: existing, error: lookupErr } = await supabase
    .from('workout_logs')
    .select('id, athlete_id, program_day_id, status, completed_at, pain_notes, general_notes')
    .eq('athlete_id', athlete.id)
    .eq('program_day_id', programDayId)
    .maybeSingle();
  if (lookupErr) throw maskDbError('log_lookup', lookupErr);

  let logRow = existing;
  let isNew = false;
  if (!logRow) {
    isNew = true;
    const { data: created, error: createErr } = await supabase
      .from('workout_logs')
      .insert({ athlete_id: athlete.id, program_day_id: programDayId, status: 'in_progress' })
      .select('id, athlete_id, program_day_id, status, completed_at, pain_notes, general_notes')
      .single();
    if (createErr || !created) throw maskDbError('log_insert', createErr ?? { message: 'no row' });
    logRow = created;

    // Pre-populate set_logs for every program_exercise of this day.
    const { data: exercises, error: exErr } = await supabase
      .from('program_exercises')
      .select('id, sets, position')
      .eq('program_day_id', programDayId)
      .order('position');
    if (exErr) throw maskDbError('exercises_lookup', exErr);

    const rows: { workout_log_id: string; program_exercise_id: string; set_number: number }[] = [];
    for (const ex of exercises ?? []) {
      for (let n = 1; n <= ex.sets; n++) {
        rows.push({ workout_log_id: created.id, program_exercise_id: ex.id, set_number: n });
      }
    }
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('set_logs').insert(rows);
      if (insErr) throw maskDbError('set_logs_insert', insErr);
    }
  }

  // Now fetch all set_logs for this log.
  const { data: sets = [], error: setsErr } = await supabase
    .from('set_logs')
    .select('id, program_exercise_id, set_number, weight_lbs, reps_done, rpe, completed')
    .eq('workout_log_id', logRow!.id)
    .order('program_exercise_id')
    .order('set_number');
  if (setsErr) throw maskDbError('sets_select', setsErr);

  if (isNew) {
    workoutBreadcrumb('workout.started', {
      workout_log_id: logRow!.id, program_day_id: programDayId, athlete_id: athlete.id,
    });
  }

  return {
    log: {
      id: logRow!.id, athleteId: logRow!.athlete_id, programDayId: logRow!.program_day_id,
      status: logRow!.status as 'in_progress' | 'completed' | 'skipped',
      completedAt: logRow!.completed_at, painNotes: logRow!.pain_notes,
      generalNotes: logRow!.general_notes,
    },
    sets: (sets ?? []).map((s) => ({
      id: s.id, programExerciseId: s.program_exercise_id, setNumber: s.set_number,
      weightLbs: s.weight_lbs, repsDone: s.reps_done, rpe: s.rpe, completed: s.completed,
    })),
  };
}
```

- [ ] **Step 2: Lifecycle integration test**

Create `tests/integration/workouts/lifecycle.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL, SR, { auth: { persistSession: false } });

describe('workout_logs lifecycle (DB-level)', () => {
  let programDayId: string;
  let exerciseId: string;
  let athleteAuthUserId: string;
  let athleteId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const c = await admin.from('coaches').insert({
      auth_user_id: (await admin.auth.admin.createUser({ email: `c-lf-${ts}@test.local`, email_confirm: true })).data.user!.id,
      display_name: 'C', email: `c-lf-${ts}@test.local`,
    }).select('id').single();
    const { data: u } = await admin.auth.admin.createUser({ email: `a-lf-${ts}@test.local`, email_confirm: true });
    athleteAuthUserId = u.user!.id;
    const a = await admin.from('athletes').insert({
      coach_id: c.data!.id, auth_user_id: athleteAuthUserId,
      name: 'A', email: `a-lf-${ts}@test.local`, is_active: true,
    }).select('id').single();
    athleteId = a.data!.id;

    const p = await admin.from('programs').insert({
      coach_id: c.data!.id, athlete_id: athleteId, name: 'P',
      block_type: 'general', total_weeks: 1, is_template: false,
    }).select('id').single();
    const d = await admin.from('program_days').insert({
      program_id: p.data!.id, week_number: 1, day_number: 1, name: 'Squat',
    }).select('id').single();
    programDayId = d.data!.id;
    const e = await admin.from('program_exercises').insert({
      program_day_id: programDayId, position: 1, name: 'Squat', sets: 3, reps: '5',
    }).select('id').single();
    exerciseId = e.data!.id;
  });

  it('UNIQUE (athlete_id, program_day_id) prevents duplicate workout_logs', async () => {
    const first = await admin.from('workout_logs').insert({
      athlete_id: athleteId, program_day_id: programDayId,
    }).select('id').single();
    expect(first.error).toBeNull();
    const second = await admin.from('workout_logs').insert({
      athlete_id: athleteId, program_day_id: programDayId,
    });
    expect(second.error).toBeTruthy();
  });

  it('UNIQUE (workout_log_id, program_exercise_id, set_number) prevents duplicate set_logs', async () => {
    const { data: log } = await admin.from('workout_logs').select('id').eq('athlete_id', athleteId).single();
    const first = await admin.from('set_logs').insert({
      workout_log_id: log!.id, program_exercise_id: exerciseId, set_number: 99,
    });
    expect(first.error).toBeNull();
    const second = await admin.from('set_logs').insert({
      workout_log_id: log!.id, program_exercise_id: exerciseId, set_number: 99,
    });
    expect(second.error).toBeTruthy();
  });

  it('updated_at trigger bumps on UPDATE', async () => {
    const { data: log } = await admin.from('workout_logs').select('id, updated_at').eq('athlete_id', athleteId).single();
    const initialUpdated = log!.updated_at;
    await new Promise((r) => setTimeout(r, 50));
    await admin.from('workout_logs').update({ general_notes: 'updated' }).eq('id', log!.id);
    const { data: after } = await admin.from('workout_logs').select('updated_at').eq('id', log!.id).single();
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(new Date(initialUpdated).getTime());
  });

  it('FK ON DELETE RESTRICT on program_day_id when log exists', async () => {
    const { error } = await admin.from('program_days').delete().eq('id', programDayId);
    expect(error).toBeTruthy();
  });
});
```

- [ ] **Step 3: Verify + commit**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm typecheck
cd "/c/Users/van/Desktop/billy" && pnpm vitest run tests/integration/workouts/
cd "/c/Users/van/Desktop/billy" && pnpm test 2>&1 | tail -3
```

Expected: 14 (10 RLS + 4 lifecycle) integration tests, full suite 87 + 4 = 91.

```bash
cd "/c/Users/van/Desktop/billy" && git add lib/workouts/get-or-create-workout-log.ts tests/integration/workouts/lifecycle.test.ts && git commit -m "feat(workouts): getOrCreateWorkoutLog idempotent helper + lifecycle test

Plan 4 Task 3. Pure-server function that returns the existing
workout_log + set_logs for (current athlete, programDayId), or creates
the log + pre-populates set_logs for every prescribed program_exercise
set count. Drops a workout.started Sentry breadcrumb on first creation.

Lifecycle integration tests verify: unique constraints, updated_at
trigger, FK ON DELETE RESTRICT.

Verified: full suite 91/91.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Save / mark-complete / reopen server actions

**Files:**
- Create: `lib/workouts/actions/save-set-log.ts`
- Create: `lib/workouts/actions/save-workout-notes.ts`
- Create: `lib/workouts/actions/mark-complete.ts`

- [ ] **Step 1: saveSetLog**

Create `lib/workouts/actions/save-set-log.ts`:

```ts
'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { saveSetLogSchema } from '../schemas';
import { workoutBreadcrumb } from '../breadcrumbs';

const GENERIC_DB_ERROR = 'Failed to save. Please try again.';

function mask(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`saveSetLog.${operation}: ${error.message}`));
  return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
}

export async function saveSetLog(input: unknown) {
  const p = saveSetLogSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentAthlete();
  const supabase = await createClient();

  const update: Record<string, unknown> = {};
  if (p.data.weightLbs !== undefined) update.weight_lbs = p.data.weightLbs;
  if (p.data.repsDone !== undefined) update.reps_done = p.data.repsDone;
  if (p.data.rpe !== undefined) update.rpe = p.data.rpe;
  if (p.data.completed !== undefined) update.completed = p.data.completed;

  const { data, error } = await supabase
    .from('set_logs').update(update).eq('id', p.data.setLogId)
    .select('id, workout_log_id').maybeSingle();
  if (error) return mask('update', error);
  if (!data) return { ok: false as const, reason: 'not_found' as const, message: 'set log not found' };

  workoutBreadcrumb('workout.set_saved', {
    set_log_id: p.data.setLogId, workout_log_id: data.workout_log_id,
  });
  return { ok: true as const, setLogId: data.id };
}
```

- [ ] **Step 2: saveWorkoutNotes**

Create `lib/workouts/actions/save-workout-notes.ts`:

```ts
'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { saveWorkoutNotesSchema } from '../schemas';
import { workoutBreadcrumb } from '../breadcrumbs';

const GENERIC_DB_ERROR = 'Failed to save notes. Please try again.';

function mask(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`saveWorkoutNotes.${operation}: ${error.message}`));
  return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
}

export async function saveWorkoutNotes(input: unknown) {
  const p = saveWorkoutNotesSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentAthlete();
  const supabase = await createClient();

  const update: Record<string, unknown> = {};
  if (p.data.painNotes !== undefined) update.pain_notes = p.data.painNotes;
  if (p.data.generalNotes !== undefined) update.general_notes = p.data.generalNotes;

  const { data, error } = await supabase
    .from('workout_logs').update(update).eq('id', p.data.workoutLogId)
    .select('id').maybeSingle();
  if (error) return mask('update', error);
  if (!data) return { ok: false as const, reason: 'not_found' as const, message: 'workout log not found' };

  workoutBreadcrumb('workout.notes_saved', { workout_log_id: p.data.workoutLogId });
  return { ok: true as const };
}
```

- [ ] **Step 3: markComplete + reopen**

Create `lib/workouts/actions/mark-complete.ts`:

```ts
'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { markWorkoutCompleteSchema } from '../schemas';
import { workoutBreadcrumb } from '../breadcrumbs';

const GENERIC_DB_ERROR = 'Failed to update workout. Please try again.';

function mask(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`markWorkoutComplete.${operation}: ${error.message}`));
  return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
}

export async function markWorkoutComplete(input: unknown) {
  const p = markWorkoutCompleteSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentAthlete();
  const supabase = await createClient();

  // Idempotent: only set completed_at if not already set.
  const { data: current } = await supabase.from('workout_logs')
    .select('id, status, completed_at').eq('id', p.data.workoutLogId).maybeSingle();
  if (!current) return { ok: false as const, reason: 'not_found' as const, message: 'workout log not found' };

  const update: Record<string, unknown> = { status: 'completed' };
  if (!current.completed_at) update.completed_at = new Date().toISOString();

  const { error } = await supabase.from('workout_logs').update(update).eq('id', p.data.workoutLogId);
  if (error) return mask('update', error);

  workoutBreadcrumb('workout.completed', { workout_log_id: p.data.workoutLogId });
  return { ok: true as const };
}

export async function reopenWorkout(input: unknown) {
  const p = markWorkoutCompleteSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentAthlete();
  const supabase = await createClient();

  const { error } = await supabase.from('workout_logs')
    .update({ status: 'in_progress', completed_at: null })
    .eq('id', p.data.workoutLogId);
  if (error) return mask('update', error);

  workoutBreadcrumb('workout.reopened', { workout_log_id: p.data.workoutLogId });
  return { ok: true as const };
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm typecheck
cd "/c/Users/van/Desktop/billy" && pnpm test 2>&1 | tail -3
```

Expected: typecheck clean, full suite still 91/91 (no new tests).

```bash
cd "/c/Users/van/Desktop/billy" && git add lib/workouts/actions && git commit -m "feat(workouts): saveSetLog + saveWorkoutNotes + markComplete/reopen actions

Plan 4 Task 4. Server actions for the workout logger:
- saveSetLog: updates a single set's weight/reps/rpe/completed.
  Server-derives athlete via getCurrentAthlete; RLS verifies ownership.
- saveWorkoutNotes: updates session-level pain/general notes.
- markWorkoutComplete: status='completed' + idempotent completed_at.
- reopenWorkout: undoes complete; clears completed_at.

All return discriminated { ok, reason, message } unions. db_error
returns mask the underlying PG message; original captured to Sentry.
Each drops a workout.* breadcrumb.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Logger UI

**Files:**
- Create: `app/app/workout/[program_day_id]/page.tsx`
- Create: `app/app/workout/[program_day_id]/workout-logger.tsx`

- [ ] **Step 1: Server page**

Create `app/app/workout/[program_day_id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { getOrCreateWorkoutLog } from '@/lib/workouts/get-or-create-workout-log';
import { WorkoutLogger } from './workout-logger';

export default async function WorkoutPage({
  params,
}: { params: Promise<{ program_day_id: string }> }) {
  const { program_day_id } = await params;
  await getCurrentAthlete();
  const supabase = await createClient();

  // Fetch the prescription tree (program_day + exercises).
  const { data: day } = await supabase
    .from('program_days')
    .select('id, week_number, day_number, name, program_id, programs(name)')
    .eq('id', program_day_id)
    .maybeSingle();
  if (!day) notFound();

  const { data: exercises = [] } = await supabase
    .from('program_exercises')
    .select('id, position, name, sets, reps, load_pct, load_lbs, rpe, group_label, notes')
    .eq('program_day_id', program_day_id)
    .order('position');

  const tree = await getOrCreateWorkoutLog(program_day_id);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">
          Week {day.week_number} · Day {day.day_number}
        </p>
        <h1 className="text-bone font-serif text-3xl">{day.name}</h1>
        <p className="text-bone-muted text-xs">
          {(day.programs as unknown as { name: string } | null)?.name ?? ''}
        </p>
      </header>
      <WorkoutLogger
        workoutLog={tree.log}
        sets={tree.sets}
        exercises={(exercises ?? []).map((e) => ({
          id: e.id, position: e.position, name: e.name, sets: e.sets, reps: e.reps,
          loadPct: e.load_pct, loadLbs: e.load_lbs, rpe: e.rpe, groupLabel: e.group_label,
        }))}
      />
    </main>
  );
}
```

- [ ] **Step 2: Logger client component**

Create `app/app/workout/[program_day_id]/workout-logger.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveSetLog } from '@/lib/workouts/actions/save-set-log';
import { saveWorkoutNotes } from '@/lib/workouts/actions/save-workout-notes';
import { markWorkoutComplete, reopenWorkout } from '@/lib/workouts/actions/mark-complete';

type Exercise = {
  id: string; position: number; name: string; sets: number; reps: string;
  loadPct: number | null; loadLbs: number | null; rpe: number | null;
  groupLabel: string | null;
};
type SetRow = {
  id: string; programExerciseId: string; setNumber: number;
  weightLbs: number | null; repsDone: number | null; rpe: number | null; completed: boolean;
};
type WorkoutLog = {
  id: string; status: 'in_progress' | 'completed' | 'skipped';
  completedAt: string | null; painNotes: string | null; generalNotes: string | null;
};

export function WorkoutLogger({
  workoutLog: initialLog, sets: initialSets, exercises,
}: {
  workoutLog: WorkoutLog;
  sets: SetRow[];
  exercises: Exercise[];
}) {
  const router = useRouter();
  const [log, setLog] = useState(initialLog);
  const [sets, setSets] = useState(initialSets);
  const [, startTransition] = useTransition();
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const isCompleted = log.status === 'completed';

  function announceSave(p: Promise<{ ok?: boolean; message?: string }>) {
    setSavingState('saving');
    p.then((r) => {
      if (r.ok === false) {
        setSavingState('error');
        return;
      }
      setSavingState('saved');
      setTimeout(() => setSavingState('idle'), 1200);
    });
  }

  function updateSetLocal(id: string, patch: Partial<SetRow>) {
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function saveSet(id: string, patch: Partial<SetRow>) {
    if (isCompleted) return;
    updateSetLocal(id, patch);
    const payload: Record<string, unknown> = { setLogId: id };
    if (patch.weightLbs !== undefined) payload.weightLbs = patch.weightLbs;
    if (patch.repsDone !== undefined) payload.repsDone = patch.repsDone;
    if (patch.rpe !== undefined) payload.rpe = patch.rpe;
    if (patch.completed !== undefined) payload.completed = patch.completed;
    startTransition(() => announceSave(saveSetLog(payload) as Promise<{ ok?: boolean }>));
  }

  function saveNotes(patch: Partial<{ painNotes: string | null; generalNotes: string | null }>) {
    if (isCompleted) return;
    setLog((l) => ({ ...l, ...patch }));
    startTransition(() => announceSave(
      saveWorkoutNotes({ workoutLogId: log.id, ...patch }) as Promise<{ ok?: boolean }>,
    ));
  }

  return (
    <div className="flex flex-col gap-8">
      <SaveIndicator state={savingState} completed={isCompleted} />

      {exercises.map((ex) => {
        const setsForEx = sets
          .filter((s) => s.programExerciseId === ex.id)
          .sort((a, b) => a.setNumber - b.setNumber);
        return (
          <ExerciseBlock key={ex.id} ex={ex} sets={setsForEx} disabled={isCompleted} onSave={saveSet} />
        );
      })}

      <NotesBlock log={log} disabled={isCompleted} onSave={saveNotes} />

      <CompletionBar log={log} onComplete={() => {
        startTransition(async () => {
          const r = await markWorkoutComplete({ workoutLogId: log.id });
          if ((r as { ok?: boolean }).ok !== false) {
            setLog((l) => ({ ...l, status: 'completed', completedAt: new Date().toISOString() }));
            router.refresh();
          }
        });
      }} onReopen={() => {
        startTransition(async () => {
          const r = await reopenWorkout({ workoutLogId: log.id });
          if ((r as { ok?: boolean }).ok !== false) {
            setLog((l) => ({ ...l, status: 'in_progress', completedAt: null }));
            router.refresh();
          }
        });
      }} />
    </div>
  );
}

function SaveIndicator({ state, completed }: { state: 'idle' | 'saving' | 'saved' | 'error'; completed: boolean }) {
  if (completed) {
    return <p className="text-gold text-xs tracking-widest uppercase">✓ Workout complete</p>;
  }
  const text = state === 'saving' ? 'Saving…' : state === 'saved' ? '✓ Saved' : state === 'error' ? 'Save failed' : '';
  const color = state === 'error' ? 'text-rose-400' : 'text-bone-faint';
  return <p className={`${color} h-4 text-xs tracking-widest uppercase`}>{text}</p>;
}

function ExerciseBlock({
  ex, sets, disabled, onSave,
}: {
  ex: Exercise; sets: SetRow[]; disabled: boolean;
  onSave: (id: string, patch: Partial<SetRow>) => void;
}) {
  const prescription = ex.loadPct != null ? `${ex.loadPct}%` : ex.loadLbs != null ? `${ex.loadLbs} lb` : '—';
  return (
    <section className="border-hairline-strong border bg-[#0c0c0c] p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          {ex.groupLabel && <p className="text-gold text-xs tracking-widest uppercase">{ex.groupLabel}</p>}
          <h3 className="text-bone font-serif text-xl">{ex.name}</h3>
        </div>
        <p className="text-bone-muted text-xs">
          {ex.sets}×{ex.reps} · {prescription}{ex.rpe != null ? ` · RPE ${ex.rpe}` : ''}
        </p>
      </header>
      <table className="text-bone w-full text-sm tabular-nums">
        <thead>
          <tr className="text-bone-faint border-b border-[#1f1d18] text-xs uppercase">
            <th className="py-1 text-left font-normal">Set</th>
            <th className="py-1 text-left font-normal">Weight</th>
            <th className="py-1 text-left font-normal">Reps</th>
            <th className="py-1 text-left font-normal">RPE</th>
            <th className="py-1 text-center font-normal">Done</th>
          </tr>
        </thead>
        <tbody>
          {sets.map((s) => (
            <tr key={s.id} className="border-b border-[#1a1814]/40">
              <td className="py-2 text-bone-faint">{s.setNumber}</td>
              <td className="py-2">
                <input type="number" inputMode="numeric" disabled={disabled}
                  defaultValue={s.weightLbs ?? ''} placeholder="lb" min={0} max={2500} step="2.5"
                  onBlur={(ev) => {
                    const v = ev.target.value === '' ? null : Number(ev.target.value);
                    if (v !== s.weightLbs) onSave(s.id, { weightLbs: v });
                  }}
                  className="text-bone w-20 bg-transparent outline-none focus:border-b focus:border-gold/60 disabled:opacity-50" />
              </td>
              <td className="py-2">
                <input type="number" inputMode="numeric" disabled={disabled}
                  defaultValue={s.repsDone ?? ''} min={0} max={200}
                  onBlur={(ev) => {
                    const v = ev.target.value === '' ? null : Number(ev.target.value);
                    if (v !== s.repsDone) onSave(s.id, { repsDone: v });
                  }}
                  className="text-bone w-16 bg-transparent outline-none focus:border-b focus:border-gold/60 disabled:opacity-50" />
              </td>
              <td className="py-2">
                <input type="number" inputMode="decimal" disabled={disabled}
                  defaultValue={s.rpe ?? ''} min={0} max={10} step="0.5"
                  onBlur={(ev) => {
                    const v = ev.target.value === '' ? null : Number(ev.target.value);
                    if (v !== s.rpe) onSave(s.id, { rpe: v });
                  }}
                  className="text-bone w-12 bg-transparent outline-none focus:border-b focus:border-gold/60 disabled:opacity-50" />
              </td>
              <td className="py-2 text-center">
                <button
                  type="button" disabled={disabled} aria-label={`Mark set ${s.setNumber} done`}
                  onClick={() => onSave(s.id, { completed: !s.completed })}
                  className={`h-8 w-8 rounded-full border ${s.completed ? 'border-gold bg-gold/10 text-gold' : 'border-hairline-strong text-bone-faint'} disabled:opacity-50`}
                >
                  {s.completed ? '✓' : ''}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function NotesBlock({
  log, disabled, onSave,
}: {
  log: WorkoutLog; disabled: boolean;
  onSave: (patch: Partial<{ painNotes: string | null; generalNotes: string | null }>) => void;
}) {
  return (
    <section className="border-hairline-strong border bg-[#0c0c0c] p-4">
      <h3 className="text-bone-muted mb-3 text-xs tracking-widest uppercase">Notes</h3>
      <label className="mb-3 flex flex-col gap-1">
        <span className="text-bone-faint text-xs">Pain (optional)</span>
        <textarea defaultValue={log.painNotes ?? ''} disabled={disabled} maxLength={2000}
          onBlur={(ev) => {
            const v = ev.target.value || null;
            if (v !== log.painNotes) onSave({ painNotes: v });
          }}
          className="border-hairline-strong h-16 w-full border bg-transparent px-3 py-2 text-bone outline-none focus:border-gold/60 disabled:opacity-50" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-bone-faint text-xs">General notes (optional)</span>
        <textarea defaultValue={log.generalNotes ?? ''} disabled={disabled} maxLength={2000}
          onBlur={(ev) => {
            const v = ev.target.value || null;
            if (v !== log.generalNotes) onSave({ generalNotes: v });
          }}
          className="border-hairline-strong h-16 w-full border bg-transparent px-3 py-2 text-bone outline-none focus:border-gold/60 disabled:opacity-50" />
      </label>
    </section>
  );
}

function CompletionBar({
  log, onComplete, onReopen,
}: { log: WorkoutLog; onComplete: () => void; onReopen: () => void }) {
  if (log.status === 'completed') {
    return (
      <div className="flex items-baseline justify-between border-hairline-strong border bg-[#0c0c0c] p-4">
        <div>
          <p className="text-gold text-xs tracking-widest uppercase">Completed</p>
          <p className="text-bone-muted text-xs">
            {log.completedAt ? new Date(log.completedAt).toLocaleString() : ''}
          </p>
        </div>
        <button type="button" onClick={onReopen}
          className="text-bone-faint hover:text-bone text-xs tracking-widest uppercase">
          Reopen
        </button>
      </div>
    );
  }
  return (
    <button type="button" onClick={onComplete}
      className="border-gold text-gold border self-start px-8 py-3 text-xs tracking-widest uppercase">
      Mark complete
    </button>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm typecheck
cd "/c/Users/van/Desktop/billy" && pnpm test 2>&1 | tail -3
```

Expected: typecheck clean, suite 91/91.

```bash
cd "/c/Users/van/Desktop/billy" && git add app/app/workout && git commit -m "feat(workouts): /app/workout/[program_day_id] logger UI

Plan 4 Task 5. Mobile-first set entry: server-rendered shell fetches
the prescription + workout_log tree, client logger handles per-set
weight/reps/rpe/done with autosave on blur. Numeric input modes for
phone keyboards. Per-set 'Done' toggle is a tappable circle. Pain +
general notes at the bottom. Mark-complete button morphs to a
'Completed' indicator with Reopen button. Save indicator near the top
flashes Saving / Saved.

All inputs disable when log.status === 'completed'; reopen via the
Reopen button restores editability.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: /app dashboard + /app/program updates

**Files:**
- Modify: `app/app/page.tsx`
- Modify: `app/app/program/program-tree.tsx`

- [ ] **Step 1: Update /app dashboard**

In `app/app/page.tsx`, the Today card needs to either:
- Link to `/app/workout/<id>` if today's workout exists and is in_progress / not_started, OR
- Show "Completed" badge if the workout_log exists with status='completed'.

Read the existing file, then add a query for completion status.

After the existing `getActiveProgram()` call, add:

```tsx
import { createClient } from '@/lib/supabase/server';

// inside AppDashboard, after `const tree = await getActiveProgram();`:
let completedDayIds = new Set<string>();
if (tree) {
  const supabase = await createClient();
  const dayIdList = tree.days.map((d) => d.id);
  if (dayIdList.length > 0) {
    const { data: logs = [] } = await supabase
      .from('workout_logs')
      .select('program_day_id, status')
      .in('program_day_id', dayIdList)
      .eq('status', 'completed');
    completedDayIds = new Set((logs ?? []).map((l) => l.program_day_id));
  }
}
```

Then in the Today card branch, replace the existing rendering of `todaysWorkout` with logic that checks `completedDayIds.has(todaysWorkout.id)`:

```tsx
{todaysWorkout ? (
  completedDayIds.has(todaysWorkout.id) ? (
    <>
      <h2 className="text-bone mt-2 font-serif text-2xl">{todaysWorkout.name}</h2>
      <p className="text-gold mt-2 text-sm tracking-widest uppercase">✓ Completed</p>
      <Link href={`/app/workout/${todaysWorkout.id}`} className="text-bone-faint mt-3 inline-block text-xs">
        Review →
      </Link>
    </>
  ) : (
    <>
      <h2 className="text-bone mt-2 font-serif text-2xl">{todaysWorkout.name}</h2>
      <p className="text-bone-muted mt-2 text-sm">
        {tree.exercises.filter((e) => e.programDayId === todaysWorkout.id).length} exercises
      </p>
      <Link href={`/app/workout/${todaysWorkout.id}`}
        className="border-gold text-gold mt-4 inline-block border px-6 py-2 text-xs tracking-widest uppercase">
        Log workout →
      </Link>
    </>
  )
) : (
  <>
    <h2 className="text-bone mt-2 font-serif text-2xl">Rest day</h2>
    <p className="text-bone-muted mt-2 text-sm">No workout scheduled today. Recover well.</p>
  </>
)}
```

In the "this week" list, add a ✓ badge to days whose id is in `completedDayIds`:

```tsx
{thisWeekDays.map((d) => (
  <li key={d.id} className="flex items-baseline justify-between px-5 py-3">
    <div>
      <p className="text-bone-faint text-xs">Day {d.dayNumber}</p>
      <p className="text-bone font-serif text-lg">{d.name}</p>
    </div>
    <div className="flex items-center gap-3">
      {completedDayIds.has(d.id) && <span className="text-gold text-xs">✓</span>}
      {d.dayNumber === todayDay && (
        <span className="text-gold text-xs tracking-widest uppercase">Today</span>
      )}
    </div>
  </li>
))}
```

- [ ] **Step 2: Update /app/program tree**

In `app/app/program/page.tsx`, fetch completed day IDs the same way, pass to ProgramTree as a prop. In `program-tree.tsx`, accept the `completedDayIds` prop and render a ✓ on completed DayCards.

For brevity, the executor can apply the same `completedDayIds` Set pattern here.

- [ ] **Step 3: Verify + commit**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm typecheck
cd "/c/Users/van/Desktop/billy" && pnpm test 2>&1 | tail -3
```

```bash
cd "/c/Users/van/Desktop/billy" && git add app/app/page.tsx app/app/program && git commit -m "feat(workouts): show completion status on /app dashboard + /app/program

Plan 4 Task 6. Today card now links 'Log workout' if not completed,
shows 'Completed' badge with Review link if done. This-week list
shows ✓ on completed days. /app/program tree shows ✓ on completed
day cards.

Completion data fetched in the server pages via the workout_logs
table (RLS-scoped to the athlete via existing policies).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Coach-side Recent Workouts on athlete detail page

**Files:**
- Create: `lib/workouts/list-recent-logs.ts`
- Modify: `app/coach/athletes/[id]/page.tsx`

- [ ] **Step 1: Implement listRecentWorkoutLogs**

Create `lib/workouts/list-recent-logs.ts`:

```ts
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';

export type RecentWorkoutLog = {
  id: string;
  programDayId: string;
  programDayName: string | null;
  weekNumber: number | null;
  dayNumber: number | null;
  status: 'in_progress' | 'completed' | 'skipped';
  completedAt: string | null;
  painNotes: string | null;
  generalNotes: string | null;
  updatedAt: string;
};

export async function listRecentWorkoutLogs(
  athleteId: string, limit = 10,
): Promise<RecentWorkoutLog[]> {
  await getCurrentCoach();
  const supabase = await createClient();

  const { data = [] } = await supabase
    .from('workout_logs')
    .select(`
      id, program_day_id, status, completed_at, pain_notes, general_notes, updated_at,
      program_days(week_number, day_number, name)
    `)
    .eq('athlete_id', athleteId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => {
    const day = row.program_days as unknown as
      { week_number: number; day_number: number; name: string } | null;
    return {
      id: row.id,
      programDayId: row.program_day_id,
      programDayName: day?.name ?? null,
      weekNumber: day?.week_number ?? null,
      dayNumber: day?.day_number ?? null,
      status: row.status as RecentWorkoutLog['status'],
      completedAt: row.completed_at,
      painNotes: row.pain_notes,
      generalNotes: row.general_notes,
      updatedAt: row.updated_at,
    };
  });
}
```

- [ ] **Step 2: Modify athlete detail page**

Read `app/coach/athletes/[id]/page.tsx`. Add a "Recent Workouts" section by appending logic to fetch + render. Don't disturb the existing structure — just add a new section.

Sketch:

```tsx
import { listRecentWorkoutLogs } from '@/lib/workouts/list-recent-logs';

// Inside the page component, after the existing data fetching:
const recentLogs = await listRecentWorkoutLogs(athleteId, 10);

// In the JSX, add this section near the bottom:
<section className="flex flex-col gap-3">
  <h2 className="text-bone-muted text-xs tracking-widest uppercase">Recent workouts</h2>
  {recentLogs.length === 0 ? (
    <p className="text-bone-faint text-sm">No workouts logged yet.</p>
  ) : (
    <ul className="border-hairline-strong border divide-y divide-[#1a1814]">
      {recentLogs.map((l) => (
        <li key={l.id} className="flex items-baseline justify-between px-4 py-3">
          <div>
            <p className="text-bone font-serif">
              Week {l.weekNumber} · Day {l.dayNumber} — {l.programDayName ?? 'Unknown day'}
            </p>
            {l.painNotes && <p className="text-rose-400/80 mt-1 text-xs">Pain: {l.painNotes.slice(0, 80)}</p>}
            {l.generalNotes && <p className="text-bone-muted mt-1 text-xs">{l.generalNotes.slice(0, 80)}</p>}
          </div>
          <div className="text-right">
            {l.status === 'completed' ? (
              <span className="text-gold text-xs tracking-widest uppercase">✓ Done</span>
            ) : (
              <span className="text-bone-faint text-xs tracking-widest uppercase">In progress</span>
            )}
            {l.completedAt && (
              <p className="text-bone-faint mt-1 text-xs">
                {new Date(l.completedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  )}
</section>
```

If the existing page has tabs or other complex structure, integrate appropriately.

- [ ] **Step 3: Verify + commit**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm typecheck
cd "/c/Users/van/Desktop/billy" && pnpm test 2>&1 | tail -3
```

```bash
cd "/c/Users/van/Desktop/billy" && git add lib/workouts/list-recent-logs.ts app/coach/athletes/\[id\]/page.tsx && git commit -m "feat(workouts): coach sees Recent Workouts on athlete detail page

Plan 4 Task 7. New listRecentWorkoutLogs query (RLS-scoped to coach's
own athletes) + new 'Recent workouts' section on the athlete detail
page. Shows up to 10 most recent logs with status, completed date,
and excerpts of pain + general notes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: E2E suite

**Files:**
- Create: `tests/e2e/workouts/log-workout.spec.ts`
- Create: `tests/e2e/workouts/coach-sees-log.spec.ts`
- Create: `tests/e2e/workouts/reopen.spec.ts`

These reuse the `seedAthleteUser`, `signInAsAthlete`, `seedAssignedProgramForAthlete` helpers from `tests/e2e/helpers/athlete-session.ts` (Plan 3b). Plus `ensureCoachAndLogin` from `coach-session.ts` for the coach-sees-log test.

Sketch for `log-workout.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedAthleteUser, signInAsAthlete, seedAssignedProgramForAthlete } from '../helpers/athlete-session';

test('athlete logs a workout end-to-end', async ({ context }) => {
  const ts = Date.now();
  const email = `ath-log-${ts}@e2e.local`;
  const { coachId, athleteId } = await seedAthleteUser(email);
  await seedAssignedProgramForAthlete(coachId, athleteId);

  const page = await signInAsAthlete(context, email);
  // Navigate to today's workout via the dashboard CTA.
  // (Test deterministically by going directly to the program page,
  // grabbing the first day id, navigating to /app/workout/<id>.)
  await page.goto('/app/program');
  // The seeded helper creates Week 1 Day 1 named 'Squat day'. Click into it.
  // Easier: directly visit /app/workout/<id>. We need the id — query via DB.
  // For the e2e helper to work, extend seedAssignedProgramForAthlete to return the day id too.
  // Then test:
  // const dayId = ...;
  // await page.goto(`/app/workout/${dayId}`);
  // Fill set 1: weight=225, reps=5
  // Click "Done" toggle on set 1
  // Click "Mark complete"
  // Expect /app to show the completed badge
});
```

> **Note for executor:** the simplest path is to extend `seedAssignedProgramForAthlete` to ALSO return `{programId, dayId}`. Then the e2e test navigates directly to `/app/workout/<dayId>` and exercises the logger UI.

Likewise for `coach-sees-log.spec.ts`: seed an athlete + program, programmatically insert a completed workout_log via admin client, then sign in as the coach and visit the athlete detail page, asserting the "Recent workouts" section shows the entry.

`reopen.spec.ts`: log + complete + reopen flow.

If specs flake or the logger interactions are too tricky (autosave timing), mark some `.skip` with a clear comment.

- [ ] **Step 1-3: Implement, run, commit**

```bash
cd "/c/Users/van/Desktop/billy" && pnpm test:e2e 2>&1 | tail -10
```

Expected: 16 (existing) + 3 (new) = 19 passing.

```bash
cd "/c/Users/van/Desktop/billy" && git add tests/e2e/helpers tests/e2e/workouts && git commit -m "test(workouts): playwright e2e for log-workout / coach-sees-log / reopen

Plan 4 Task 8. Three new e2e specs covering: athlete logs a workout
end-to-end with autosave + mark-complete; coach sees the logged
workout on the athlete detail page; reopen restores editability.

Helper seedAssignedProgramForAthlete extended to also return the
seeded program_day's id so e2e tests can navigate directly.

Verified: 19/19 e2e tests passing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Final gates + push

- [ ] **Step 1: All gates**

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
- vitest: 71 (existing) + 6 (schemas) + 10 (RLS) + 4 (lifecycle) = 91 passing
- playwright: 16 (existing) + 3 (new) = 19 passing

- [ ] **Step 2: Confirm clean tree + show commits**

```bash
cd "/c/Users/van/Desktop/billy" && git status --short
cd "/c/Users/van/Desktop/billy" && git log --oneline origin/main..HEAD
```

Expected: clean (only gitignored). Log shows the Plan 4 commits.

- [ ] **Step 3: Push**

```bash
cd "/c/Users/van/Desktop/billy" && git push origin main
```

Plan 4 shipped — the V1 MVP loop is closed.

- [ ] **Step 4: Append session log entry** to `.session-logs/session-<today>.md`.

---

## Self-review checklist

- [ ] Athlete logs a workout end-to-end and sees completion on /app.
- [ ] Coach sees the workout on /coach/athletes/[id] under Recent Workouts.
- [ ] Athlete A cannot read Athlete B's workout_logs (RLS).
- [ ] Coach A cannot read Athlete B's logs where B is Coach B's athlete.
- [ ] Athlete cannot UPDATE another athlete's logs.
- [ ] Mark-complete is idempotent on completed_at.
- [ ] Reopen clears completed_at + status='in_progress'.
- [ ] Coach changing a prescription's `sets` count after athlete logged doesn't delete historical set_logs.
- [ ] All inputs use numeric inputmode on the logger.
- [ ] Save indicator visibly cycles through Saving/Saved/Idle.
- [ ] Lint shows 0 errors; warning count unchanged.
- [ ] No service-role secret leaks to client code.

---

## Known limitations to log for V1

- Coach cannot edit athlete logs. (V1.5)
- No e1RM / progress charts. (Separate plan)
- No Apple Health / Google Fit integration. (V2)
- No bulk-edit "redo last set" affordance. (V1.5)
- No "copy yesterday's logs" feature. (V1.5)
- No workout reminders / push notifications. (V1.5+)
- No per-set rest timer. (V2)
- Athletes can log workouts for any of their assigned days, including past and future. (V1 simplification.)
- No optimistic locking; rare cross-device contention is last-write-wins.

---

## Notes for the executor

- Run `pnpm typecheck && pnpm test` after each task.
- After Task 1, if `Failed to inspect container health` shows up, restart Kong: `docker restart supabase_kong_plan-1-foundation`.
- After Task 8 push, append a session-log entry summarizing the commits, gates, and final state.
- The `seedAssignedProgramForAthlete` helper in Plan 3b returns `{ programId }`. For Plan 4's e2e specs, extend it to also return `{ dayId }` (the first program_day's id) so tests can navigate to the logger directly. Edit `tests/e2e/helpers/athlete-session.ts` accordingly.
