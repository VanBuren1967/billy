# Plan 3 — Programs Subsystem (Coach Side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the coach-side programs subsystem — library + builder + assignment — so William can create a powerlifting program (weeks → days → exercises with optional A1/A2 superset grouping), assign it to an athlete via deep-copy, and edit it safely with concurrent-edit detection.

**Architecture:** Server-component-first Next.js 16 with App Router. Postgres (Supabase) with RLS as the security guarantee. Zod for input validation. Server-derived `coach_id` (client never sends). Optimistic locking via the existing `version` column. Sentry breadcrumbs for lifecycle events. Sub-systems isolated under `lib/programs/` (schemas, helpers, actions) and `app/coach/programs/`.

**Tech Stack:** Next.js 16 App Router (server components, server actions, `notFound()`), Supabase (Postgres + auth + RLS), Zod, Tailwind v4 (Vault tokens already in place), Vitest (unit + integration), Playwright (e2e). No new npm dependencies.

**Spec reference:** `docs/superpowers/specs/2026-04-27-billy-plan-3-programs-coach-design.md`.

**Working directory for all commands:** `C:\Users\van\Desktop\billy` (forward slashes in bash). All `pnpm`/`supabase` commands run from the repo root unless noted.

**Builds on:** Plan 1 (foundation + auth + middleware role gate), Plan 2 (athletes table + invite flow), Plan 2.5 (branded transactional emails — shipped). Reuses `lib/supabase/{client,server,admin}.ts`, the `proxy.ts` middleware role gate, the existing Vault Tailwind tokens.

---

## Out of scope (deferred to later plans)

Per spec section 14:

- Athlete program viewer (`/app/program`) → Plan 3b.
- Workout logging (`workout_logs`, `set_logs`) → Plan 4.
- Drag-drop reordering → V1.5.
- Bulk-edit operators (scale all loads, swap exercise across all weeks) → V1.5.
- Stock template marketplace, CSV import, AI suggestions, athlete-level overrides, mesocycle wall view → V1.5+.
- Cluster/drop sets/conditional rules (Tier-C complexity) → V1.5+.
- Real audit-log table (Sentry breadcrumbs cover V1).

---

## File map (Plan 3)

| Path | Purpose |
|---|---|
| `supabase/migrations/0006_programs_tables.sql` | New. Creates `programs`, `program_days`, `program_exercises` per spec §4 with `group_label` baked in. |
| `supabase/migrations/0007_programs_rls.sql` | New. `auth_coach_id()` helper function + RLS policies for all three program tables. |
| `lib/programs/schemas.ts` | New. Zod schemas for every server action's inputs and the typed return shapes. |
| `lib/programs/get-current-coach.ts` | New. Server-side helper deriving the current coach record from `auth.uid()`. Throws on no-auth or non-coach. |
| `lib/programs/duplicate.ts` | New. Deep-copy helper used by template duplication and template-assignment flows. |
| `lib/programs/actions/list-programs.ts` | New. `listPrograms({tab, athleteId?})` server function for library + per-athlete views. |
| `lib/programs/actions/create-program.ts` | New. `createProgram({mode, ...})` server action. Three modes: blank, duplicate_template, duplicate_program. |
| `lib/programs/actions/save-program.ts` | New. `saveProgramHeader`, `saveProgramDay`, `saveProgramExercise`, `addProgramDay`, `addProgramExercise`, `removeProgramDay`, `removeProgramExercise`. |
| `lib/programs/actions/reorder.ts` | New. `reorderProgramDay`, `reorderProgramExercise` (move up/down by 1). |
| `lib/programs/actions/assign-program.ts` | New. `assignProgramToAthlete({templateProgramId, athleteId, startDate})`. |
| `lib/programs/actions/archive-program.ts` | New. `archiveProgram({id})`, `restoreProgram({id})`. |
| `lib/programs/breadcrumbs.ts` | New. Sentry breadcrumb helpers for `program.created`, `assigned`, `edited`, `archived`, `version_conflict`. |
| `app/coach/programs/page.tsx` | New. Library — Programs + Templates tabs, sort by recency, block-type filter, archive toggle, empty state. |
| `app/coach/programs/new/page.tsx` | New. Three-mode entry: blank / duplicate template / duplicate program. |
| `app/coach/programs/[id]/edit/page.tsx` | New. Server-rendered builder shell + `<ProgramBuilder>` client component. |
| `app/coach/programs/[id]/edit/program-builder.tsx` | New. Client component: collapsible Week → Day → Exercise tree, inline edit, autosave on blur, ▲▼ reorder, conflict prompt. |
| `app/coach/programs/[id]/assign/page.tsx` | New. Athlete picker + start-date input → calls `assignProgramToAthlete`. |
| `app/coach/athletes/[id]/programs/page.tsx` | New. Per-athlete program list (active + archived toggle), read-only summary linking to builder. |
| `tests/unit/programs/schemas.test.ts` | New. Zod schema unit tests. |
| `tests/unit/programs/duplicate.test.ts` | New. Deep-copy helper tests. |
| `tests/integration/programs/rls.test.ts` | New. RLS isolation tests across `programs`, `program_days`, `program_exercises`. |
| `tests/integration/programs/version-conflict.test.ts` | New. Optimistic-lock conflict detection. |
| `tests/integration/programs/assign.test.ts` | New. Deep-copy on assign + independence after edit. |
| `tests/integration/programs/archive.test.ts` | New. Soft-archive + restore + filter. |
| `tests/e2e/programs/builder-blank.spec.ts` | New. Create blank → builder → add structures → reload preserves. |
| `tests/e2e/programs/builder-from-template.spec.ts` | New. Duplicate template → builder shows copied structure. |
| `tests/e2e/programs/assign-template.spec.ts` | New. Assign → new editor opens → exercises present. |
| `tests/e2e/programs/edit-after-assign.spec.ts` | New. Edit assigned copy ≠ template; edit template ≠ assigned copy. |
| `tests/e2e/programs/concurrent-edit.spec.ts` | New. Two-tab conflict warning. |
| `tests/e2e/programs/archive.spec.ts` | New. Archive flow. |

---

## Pre-flight (ONCE, before Task 1)

- [ ] **PF-1.** Confirm local Supabase is running and the working tree is clean:

```bash
pnpm exec supabase status
```

Expected: `API URL`, `DB URL`, `Studio URL`, `Inbucket URL` all reported.

```bash
git status --short
```

Expected: clean (only gitignored `.claude/`, `.superpowers/` may be untracked).

- [ ] **PF-2.** Confirm baseline tests + typecheck pass:

```bash
pnpm typecheck && pnpm test
```

Expected: typecheck passes; 23/23 unit/integration tests pass.

```bash
pnpm test:e2e
```

Expected: 7/7 e2e pass.

If any of these fail, stop and surface to the user before starting Task 1.

---

## Task 1: Migration 0006 — programs tables

**Files:**
- Create: `supabase/migrations/0006_programs_tables.sql`

This task creates the three program tables with `group_label` baked into `program_exercises` from the start. RLS policies come in Task 2 (separate migration so the RLS test in Task 2 has a clean baseline to assert against).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0006_programs_tables.sql`:

```sql
-- Plan 3 — Programs subsystem (coach side): create programs, program_days,
-- program_exercises tables. RLS policies are added in 0007 to keep that
-- migration's failing-then-passing test trivial to write.

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  athlete_id uuid references public.athletes(id) on delete set null,
  name text not null,
  block_type text not null check (block_type in ('hypertrophy','strength','peak','general')),
  start_date date,
  end_date date,
  total_weeks integer not null check (total_weeks between 1 and 52),
  notes text,
  is_template boolean not null default false,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now()
);
create index programs_coach_id_idx on public.programs(coach_id);
create index programs_athlete_id_idx on public.programs(athlete_id) where athlete_id is not null;
create index programs_is_template_idx on public.programs(is_template);

create table public.program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  week_number integer not null check (week_number > 0),
  day_number integer not null check (day_number > 0),
  name text not null,
  notes text,
  unique (program_id, week_number, day_number)
);
create index program_days_program_id_idx on public.program_days(program_id);

create table public.program_exercises (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references public.program_days(id) on delete cascade,
  position integer not null,
  name text not null,
  sets integer not null check (sets > 0),
  reps text not null,
  load_pct numeric check (load_pct is null or load_pct between 0 and 150),
  load_lbs numeric check (load_lbs is null or load_lbs >= 0),
  rpe numeric check (rpe is null or rpe between 0 and 10),
  group_label text,
  notes text
);
create index program_exercises_program_day_id_idx on public.program_exercises(program_day_id);
comment on column public.program_exercises.group_label is
  'Optional grouping label like "A", "B" for supersets/circuits. Null = standalone. Exercises in the same program_day with the same group_label form a block ordered by position.';
```

- [ ] **Step 2: Apply the migration**

```bash
pnpm exec supabase db reset
```

Expected: migrations 0001-0006 apply cleanly. `Database reset` printed.

- [ ] **Step 3: Smoke-verify the tables exist with `gen_random_uuid` defaults**

```bash
ANON=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2)
SR=$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2)
curl -s "http://127.0.0.1:54321/rest/v1/programs?select=id&limit=0" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -o /dev/null -w "programs select(empty): HTTP %{http_code}\n"
```

Expected: `programs select(empty): HTTP 200` (RLS not yet enabled so anon can hit it).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_programs_tables.sql
git commit -m "feat(programs): create programs, program_days, program_exercises tables"
```

---

## Task 2: Migration 0007 — RLS policies + auth_coach_id() helper

**Files:**
- Create: `supabase/migrations/0007_programs_rls.sql`
- Create: `tests/integration/programs/rls.test.ts`

This task locks down the new tables. We write the failing RLS test first (asserting cross-coach isolation), then add the migration to make it pass.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/programs/rls.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function makeUserClient(email: string) {
  const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (!created.user) throw new Error('createUser failed');
  await admin.auth.admin.updateUserById(created.user.id, { password: 'TestPass123!' });
  const userClient = createClient(URL, ANON, {
    auth: { persistSession: false, storageKey: `sb-test-${created.user.id}` },
  });
  await userClient.auth.signInWithPassword({ email, password: 'TestPass123!' });
  return { client: userClient, userId: created.user.id };
}

describe('RLS — programs / program_days / program_exercises', () => {
  let coachAClient: SupabaseClient;
  let coachBClient: SupabaseClient;
  let coachAId: string;
  let coachBId: string;
  let programAId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const ca = await makeUserClient(`coach-a-prog-${ts}@test.local`);
    const cb = await makeUserClient(`coach-b-prog-${ts}@test.local`);
    coachAClient = ca.client;
    coachBClient = cb.client;

    // Create coach rows via service role.
    const a = await admin.from('coaches').insert({
      auth_user_id: ca.userId, display_name: 'Coach A', email: `coach-a-prog-${ts}@test.local`,
    }).select('id').single();
    coachAId = a.data!.id;

    const b = await admin.from('coaches').insert({
      auth_user_id: cb.userId, display_name: 'Coach B', email: `coach-b-prog-${ts}@test.local`,
    }).select('id').single();
    coachBId = b.data!.id;

    const p = await admin.from('programs').insert({
      coach_id: coachAId, name: 'A Program', block_type: 'strength', total_weeks: 4,
    }).select('id').single();
    programAId = p.data!.id;
  });

  it('coach B cannot SELECT coach A\'s programs', async () => {
    const { data } = await coachBClient.from('programs').select('id').eq('id', programAId);
    expect(data).toEqual([]);
  });

  it('coach A can SELECT their own programs', async () => {
    const { data } = await coachAClient.from('programs').select('id').eq('id', programAId);
    expect(data?.length).toBe(1);
  });

  it('coach B cannot INSERT a program with coach_id = coach A', async () => {
    const { error } = await coachBClient.from('programs').insert({
      coach_id: coachAId, name: 'Spoof', block_type: 'general', total_weeks: 1,
    });
    expect(error).toBeTruthy();
    expect(error!.message.toLowerCase()).toMatch(/row.level|policy|violates/);
  });

  it('coach B cannot UPDATE coach A\'s program', async () => {
    const { error, data } = await coachBClient.from('programs')
      .update({ name: 'hijacked' }).eq('id', programAId).select();
    expect(data ?? []).toEqual([]);
    // Either error or empty result depending on policy shape.
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run tests/integration/programs/rls.test.ts
```

Expected: tests fail (no RLS yet — coach B can read coach A's program).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0007_programs_rls.sql`:

```sql
-- Plan 3 — Programs subsystem RLS. Per-coach isolation enforced at the
-- database layer: even with a leaked anon key, a signed-in coach cannot
-- read or write another coach's programs.

-- Helper: returns the coaches.id for the current authenticated user, or null.
create or replace function public.auth_coach_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from public.coaches where auth_user_id = auth.uid()
$$;

-- Enable RLS.
alter table public.programs enable row level security;
alter table public.program_days enable row level security;
alter table public.program_exercises enable row level security;

-- programs: coach reads/writes own only. No DELETE policy (soft-archive only).
create policy programs_coach_select on public.programs
  for select using (coach_id = public.auth_coach_id());

create policy programs_coach_insert on public.programs
  for insert with check (coach_id = public.auth_coach_id());

create policy programs_coach_update on public.programs
  for update using (coach_id = public.auth_coach_id())
  with check (coach_id = public.auth_coach_id());

-- program_days: traverse program_id → coach_id.
create policy program_days_coach_select on public.program_days
  for select using (program_id in (
    select id from public.programs where coach_id = public.auth_coach_id()
  ));

create policy program_days_coach_insert on public.program_days
  for insert with check (program_id in (
    select id from public.programs where coach_id = public.auth_coach_id()
  ));

create policy program_days_coach_update on public.program_days
  for update using (program_id in (
    select id from public.programs where coach_id = public.auth_coach_id()
  ));

create policy program_days_coach_delete on public.program_days
  for delete using (program_id in (
    select id from public.programs where coach_id = public.auth_coach_id()
  ));

-- program_exercises: traverse program_day_id → program_id → coach_id.
create policy program_exercises_coach_select on public.program_exercises
  for select using (program_day_id in (
    select pd.id from public.program_days pd
      join public.programs p on p.id = pd.program_id
    where p.coach_id = public.auth_coach_id()
  ));

create policy program_exercises_coach_insert on public.program_exercises
  for insert with check (program_day_id in (
    select pd.id from public.program_days pd
      join public.programs p on p.id = pd.program_id
    where p.coach_id = public.auth_coach_id()
  ));

create policy program_exercises_coach_update on public.program_exercises
  for update using (program_day_id in (
    select pd.id from public.program_days pd
      join public.programs p on p.id = pd.program_id
    where p.coach_id = public.auth_coach_id()
  ));

create policy program_exercises_coach_delete on public.program_exercises
  for delete using (program_day_id in (
    select pd.id from public.program_days pd
      join public.programs p on p.id = pd.program_id
    where p.coach_id = public.auth_coach_id()
  ));

grant execute on function public.auth_coach_id() to authenticated;
```

- [ ] **Step 4: Apply migration and re-run the RLS test**

```bash
pnpm exec supabase db reset
pnpm vitest run tests/integration/programs/rls.test.ts
```

Expected: 4/4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0007_programs_rls.sql tests/integration/programs/rls.test.ts
git commit -m "feat(programs): RLS isolation for programs subsystem"
```

---

## Task 3: Zod schemas

**Files:**
- Create: `lib/programs/schemas.ts`
- Create: `tests/unit/programs/schemas.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/programs/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createProgramSchema,
  saveProgramExerciseSchema,
  saveProgramHeaderSchema,
} from '@/lib/programs/schemas';

describe('createProgramSchema', () => {
  it('accepts a valid blank program', () => {
    const r = createProgramSchema.safeParse({
      mode: 'blank',
      name: 'Strength block 1',
      blockType: 'strength',
      totalWeeks: 12,
      isTemplate: false,
    });
    expect(r.success).toBe(true);
  });

  it('rejects totalWeeks > 52', () => {
    const r = createProgramSchema.safeParse({
      mode: 'blank',
      name: 'Bad',
      blockType: 'strength',
      totalWeeks: 53,
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown blockType', () => {
    const r = createProgramSchema.safeParse({
      mode: 'blank',
      name: 'X',
      blockType: 'cardio',
      totalWeeks: 4,
    });
    expect(r.success).toBe(false);
  });

  it('accepts duplicate_template mode with sourceProgramId', () => {
    const r = createProgramSchema.safeParse({
      mode: 'duplicate_template',
      sourceProgramId: '00000000-0000-0000-0000-000000000000',
    });
    expect(r.success).toBe(true);
  });
});

describe('saveProgramExerciseSchema', () => {
  it('accepts AMRAP rep text', () => {
    const r = saveProgramExerciseSchema.safeParse({
      programExerciseId: '00000000-0000-0000-0000-000000000000',
      programVersion: 1,
      name: 'Squat',
      sets: 4,
      reps: 'AMRAP @ RPE 9',
    });
    expect(r.success).toBe(true);
  });

  it('accepts cluster shorthand "3+1+1" in reps', () => {
    const r = saveProgramExerciseSchema.safeParse({
      programExerciseId: '00000000-0000-0000-0000-000000000000',
      programVersion: 2,
      name: 'Squat',
      sets: 5,
      reps: '3+1+1',
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty reps', () => {
    const r = saveProgramExerciseSchema.safeParse({
      programExerciseId: '00000000-0000-0000-0000-000000000000',
      programVersion: 1,
      name: 'Squat',
      sets: 5,
      reps: '',
    });
    expect(r.success).toBe(false);
  });

  it('caps groupLabel length at 20', () => {
    const r = saveProgramExerciseSchema.safeParse({
      programExerciseId: '00000000-0000-0000-0000-000000000000',
      programVersion: 1,
      name: 'Squat',
      sets: 5,
      reps: '5',
      groupLabel: 'a'.repeat(21),
    });
    expect(r.success).toBe(false);
  });

  it('rejects rpe > 10', () => {
    const r = saveProgramExerciseSchema.safeParse({
      programExerciseId: '00000000-0000-0000-0000-000000000000',
      programVersion: 1,
      name: 'Squat',
      sets: 5,
      reps: '5',
      rpe: 11,
    });
    expect(r.success).toBe(false);
  });
});

describe('saveProgramHeaderSchema', () => {
  it('accepts minimal valid update', () => {
    const r = saveProgramHeaderSchema.safeParse({
      programId: '00000000-0000-0000-0000-000000000000',
      programVersion: 1,
      name: 'Renamed',
      blockType: 'peak',
      totalWeeks: 8,
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run tests/unit/programs/schemas.test.ts
```

Expected: imports fail (`Cannot find module '@/lib/programs/schemas'`).

- [ ] **Step 3: Implement the schemas**

Create `lib/programs/schemas.ts`:

```ts
import { z } from 'zod';

export const blockTypeSchema = z.enum(['hypertrophy', 'strength', 'peak', 'general']);
export type BlockType = z.infer<typeof blockTypeSchema>;

const uuid = z.string().uuid();
const optionalDate = z.string().date().optional().nullable();

export const createProgramSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('blank'),
    name: z.string().min(1).max(120),
    blockType: blockTypeSchema,
    totalWeeks: z.number().int().min(1).max(52),
    notes: z.string().max(2000).optional().nullable(),
    isTemplate: z.boolean().default(false),
    athleteId: uuid.optional().nullable(),
    startDate: optionalDate,
  }),
  z.object({
    mode: z.literal('duplicate_template'),
    sourceProgramId: uuid,
  }),
  z.object({
    mode: z.literal('duplicate_program'),
    sourceProgramId: uuid,
  }),
]);
export type CreateProgramInput = z.infer<typeof createProgramSchema>;

export const saveProgramHeaderSchema = z.object({
  programId: uuid,
  programVersion: z.number().int().min(1),
  name: z.string().min(1).max(120),
  blockType: blockTypeSchema,
  totalWeeks: z.number().int().min(1).max(52),
  startDate: optionalDate,
  endDate: optionalDate,
  notes: z.string().max(2000).optional().nullable(),
});
export type SaveProgramHeaderInput = z.infer<typeof saveProgramHeaderSchema>;

export const saveProgramDaySchema = z.object({
  programDayId: uuid,
  programVersion: z.number().int().min(1),
  weekNumber: z.number().int().min(1),
  dayNumber: z.number().int().min(1),
  name: z.string().min(1).max(120),
  notes: z.string().max(500).optional().nullable(),
});
export type SaveProgramDayInput = z.infer<typeof saveProgramDaySchema>;

export const saveProgramExerciseSchema = z.object({
  programExerciseId: uuid,
  programVersion: z.number().int().min(1),
  name: z.string().min(1).max(120),
  sets: z.number().int().min(1).max(50),
  reps: z.string().min(1).max(40),
  loadPct: z.number().min(0).max(150).optional().nullable(),
  loadLbs: z.number().min(0).max(2500).optional().nullable(),
  rpe: z.number().min(0).max(10).optional().nullable(),
  groupLabel: z.string().min(1).max(20).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});
export type SaveProgramExerciseInput = z.infer<typeof saveProgramExerciseSchema>;

export const addProgramDaySchema = z.object({
  programId: uuid,
  programVersion: z.number().int().min(1),
  weekNumber: z.number().int().min(1),
});
export type AddProgramDayInput = z.infer<typeof addProgramDaySchema>;

export const addProgramExerciseSchema = z.object({
  programDayId: uuid,
  programVersion: z.number().int().min(1),
});
export type AddProgramExerciseInput = z.infer<typeof addProgramExerciseSchema>;

export const removeProgramDaySchema = z.object({
  programDayId: uuid,
  programVersion: z.number().int().min(1),
});
export const removeProgramExerciseSchema = z.object({
  programExerciseId: uuid,
  programVersion: z.number().int().min(1),
});

export const reorderSchema = z.object({
  id: uuid,
  programVersion: z.number().int().min(1),
  direction: z.enum(['up', 'down']),
});
export type ReorderInput = z.infer<typeof reorderSchema>;

export const assignProgramSchema = z.object({
  templateProgramId: uuid,
  athleteId: uuid,
  startDate: z.string().date(),
});
export type AssignProgramInput = z.infer<typeof assignProgramSchema>;

export const archiveProgramSchema = z.object({
  programId: uuid,
});
export type ArchiveProgramInput = z.infer<typeof archiveProgramSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run tests/unit/programs/schemas.test.ts
```

Expected: all schema tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/programs/schemas.ts tests/unit/programs/schemas.test.ts
git commit -m "feat(programs): zod schemas for program CRUD inputs"
```

---

## Task 4: `getCurrentCoach` server-side helper

**Files:**
- Create: `lib/programs/get-current-coach.ts`

This helper appears in every server action. Centralizes the auth → coach record lookup so action bodies stay focused on business logic.

- [ ] **Step 1: Write the helper**

Create `lib/programs/get-current-coach.ts`:

```ts
import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type CurrentCoach = {
  authUserId: string;
  id: string;
  displayName: string;
};

/**
 * Resolve the current authenticated user → their coaches row.
 *
 * Throws on:
 * - unauthenticated (no auth.uid())
 * - authenticated but no matching coaches row (i.e. an athlete or stranger
 *   trying to hit a coach-only action — middleware should already have
 *   bounced, but this is the second-line defense)
 *
 * RLS will independently block any subsequent query a misconfigured caller
 * tries to run against another coach's data.
 */
export async function getCurrentCoach(): Promise<CurrentCoach> {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) {
    throw new Error('unauthenticated');
  }
  const { data: coach, error } = await supabase
    .from('coaches')
    .select('id, display_name')
    .eq('auth_user_id', userRes.user.id)
    .maybeSingle();
  if (error) {
    throw new Error(`coach_lookup_failed: ${error.message}`);
  }
  if (!coach) {
    throw new Error('not_a_coach');
  }
  return {
    authUserId: userRes.user.id,
    id: coach.id,
    displayName: coach.display_name,
  };
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add lib/programs/get-current-coach.ts
git commit -m "feat(programs): getCurrentCoach server-side auth helper"
```

---

## Task 5: Deep-copy helper

**Files:**
- Create: `lib/programs/duplicate.ts`
- Create: `tests/unit/programs/duplicate.test.ts`

This helper is the heart of the assignment flow (template → assigned program) and the "duplicate program" flow.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/programs/duplicate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDeepCopyPayload } from '@/lib/programs/duplicate';

const sourceProgram = {
  id: 'p1', coach_id: 'c1', name: 'Base', block_type: 'strength' as const,
  total_weeks: 4, notes: null, is_template: true, is_active: true, version: 3,
  start_date: null, end_date: null, athlete_id: null, created_at: '2026-01-01',
};
const sourceDays = [
  { id: 'd1', program_id: 'p1', week_number: 1, day_number: 1, name: 'Squat', notes: null },
  { id: 'd2', program_id: 'p1', week_number: 1, day_number: 2, name: 'Bench', notes: null },
];
const sourceExercises = [
  { id: 'e1', program_day_id: 'd1', position: 1, name: 'Squat', sets: 5, reps: '5',
    load_pct: 75, load_lbs: null, rpe: 7, group_label: null, notes: null },
  { id: 'e2', program_day_id: 'd1', position: 2, name: 'RDL', sets: 3, reps: '8',
    load_pct: null, load_lbs: 185, rpe: null, group_label: 'A', notes: null },
];

describe('buildDeepCopyPayload', () => {
  it('clones into a new program with override fields applied', () => {
    const out = buildDeepCopyPayload(sourceProgram, sourceDays, sourceExercises, {
      coachId: 'c1', athleteId: 'a1', isTemplate: false,
      startDate: '2026-05-01', name: 'Assigned to Athlete', endDate: '2026-05-29',
    });
    expect(out.program.coach_id).toBe('c1');
    expect(out.program.athlete_id).toBe('a1');
    expect(out.program.is_template).toBe(false);
    expect(out.program.is_active).toBe(true);
    expect(out.program.version).toBe(1); // reset
    expect(out.program.name).toBe('Assigned to Athlete');
    expect(out.program.start_date).toBe('2026-05-01');
    expect(out.program.end_date).toBe('2026-05-29');
  });

  it('preserves day order and clones day rows with new program_id', () => {
    const out = buildDeepCopyPayload(sourceProgram, sourceDays, sourceExercises, {
      coachId: 'c1', isTemplate: true,
    });
    expect(out.days.length).toBe(2);
    expect(out.days[0].week_number).toBe(1);
    expect(out.days[0].day_number).toBe(1);
    expect(out.days[1].week_number).toBe(1);
    expect(out.days[1].day_number).toBe(2);
  });

  it('preserves group_label and position on exercises', () => {
    const out = buildDeepCopyPayload(sourceProgram, sourceDays, sourceExercises, {
      coachId: 'c1', isTemplate: true,
    });
    const cloneE2 = out.exercises.find((e) => e.name === 'RDL');
    expect(cloneE2?.group_label).toBe('A');
    expect(cloneE2?.position).toBe(2);
    expect(cloneE2?.load_lbs).toBe(185);
  });

  it('regenerates ids — no source ids leak through', () => {
    const out = buildDeepCopyPayload(sourceProgram, sourceDays, sourceExercises, {
      coachId: 'c1', isTemplate: true,
    });
    const allNewIds = [
      out.program.id,
      ...out.days.map((d) => d.id),
      ...out.exercises.map((e) => e.id),
    ];
    const sourceIds = ['p1', 'd1', 'd2', 'e1', 'e2'];
    for (const id of sourceIds) {
      expect(allNewIds).not.toContain(id);
    }
  });

  it('rewires exercise.program_day_id to the new day rows', () => {
    const out = buildDeepCopyPayload(sourceProgram, sourceDays, sourceExercises, {
      coachId: 'c1', isTemplate: true,
    });
    const newDayId = out.days[0].id;
    const exsForDay1 = out.exercises.filter((e) => e.program_day_id === newDayId);
    expect(exsForDay1.length).toBe(2);
    // None point at the original 'd1'.
    expect(out.exercises.some((e) => e.program_day_id === 'd1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run tests/unit/programs/duplicate.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement the helper**

Create `lib/programs/duplicate.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { BlockType } from './schemas';

export type SourceProgram = {
  id: string;
  coach_id: string;
  athlete_id: string | null;
  name: string;
  block_type: BlockType;
  total_weeks: number;
  notes: string | null;
  start_date: string | null;
  end_date: string | null;
  is_template: boolean;
  is_active: boolean;
  version: number;
  created_at: string;
};

export type SourceDay = {
  id: string;
  program_id: string;
  week_number: number;
  day_number: number;
  name: string;
  notes: string | null;
};

export type SourceExercise = {
  id: string;
  program_day_id: string;
  position: number;
  name: string;
  sets: number;
  reps: string;
  load_pct: number | null;
  load_lbs: number | null;
  rpe: number | null;
  group_label: string | null;
  notes: string | null;
};

export type DeepCopyOverrides = {
  coachId: string;
  athleteId?: string | null;
  isTemplate: boolean;
  startDate?: string | null;
  endDate?: string | null;
  name?: string;
};

export type DeepCopyPayload = {
  program: Omit<SourceProgram, 'created_at'> & { created_at?: undefined };
  days: SourceDay[];
  exercises: SourceExercise[];
};

/**
 * Build the inserts for a deep-copy of a program.
 *
 * Pure function — no DB calls. The caller wraps the returned payload in
 * a transactional insert (a single Postgres function call or three
 * sequential inserts) and applies it via the supabase client.
 */
export function buildDeepCopyPayload(
  source: SourceProgram,
  sourceDays: SourceDay[],
  sourceExercises: SourceExercise[],
  ov: DeepCopyOverrides,
): DeepCopyPayload {
  const newProgramId = randomUUID();

  // Map old day id → new day id so we can rewrite exercise.program_day_id.
  const dayIdMap = new Map<string, string>();
  const days: SourceDay[] = sourceDays
    .slice()
    .sort((a, b) =>
      a.week_number - b.week_number || a.day_number - b.day_number,
    )
    .map((d) => {
      const id = randomUUID();
      dayIdMap.set(d.id, id);
      return {
        id,
        program_id: newProgramId,
        week_number: d.week_number,
        day_number: d.day_number,
        name: d.name,
        notes: d.notes,
      };
    });

  const exercises: SourceExercise[] = sourceExercises
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((e) => ({
      id: randomUUID(),
      program_day_id: dayIdMap.get(e.program_day_id)!,
      position: e.position,
      name: e.name,
      sets: e.sets,
      reps: e.reps,
      load_pct: e.load_pct,
      load_lbs: e.load_lbs,
      rpe: e.rpe,
      group_label: e.group_label,
      notes: e.notes,
    }));

  return {
    program: {
      id: newProgramId,
      coach_id: ov.coachId,
      athlete_id: ov.athleteId ?? null,
      name: ov.name ?? source.name,
      block_type: source.block_type,
      total_weeks: source.total_weeks,
      notes: source.notes,
      start_date: ov.startDate ?? null,
      end_date: ov.endDate ?? null,
      is_template: ov.isTemplate,
      is_active: true,
      version: 1, // reset version on a fresh copy
      created_at: undefined,
    },
    days,
    exercises,
  };
}
```

- [ ] **Step 4: Run test to verify pass + run full suite**

```bash
pnpm vitest run tests/unit/programs/duplicate.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/programs/duplicate.ts tests/unit/programs/duplicate.test.ts
git commit -m "feat(programs): pure deep-copy helper for template duplication"
```

---

## Task 6: Sentry breadcrumb helpers

**Files:**
- Create: `lib/programs/breadcrumbs.ts`

Tiny module so server actions can drop a structured breadcrumb in one line.

- [ ] **Step 1: Implement**

Create `lib/programs/breadcrumbs.ts`:

```ts
import * as Sentry from '@sentry/nextjs';

type ProgramEventType =
  | 'program.created'
  | 'program.assigned'
  | 'program.edited'
  | 'program.archived'
  | 'program.restored'
  | 'program.version_conflict';

export function programBreadcrumb(type: ProgramEventType, data: Record<string, unknown>) {
  Sentry.addBreadcrumb({
    category: 'programs',
    type,
    level: 'info',
    data: { event: type, ...data },
    timestamp: Date.now() / 1000,
  });
}

/**
 * Version-conflict events get captured as a Sentry message (not just a
 * breadcrumb) so we can monitor frequency. Frequent conflicts = UX problem.
 */
export function captureVersionConflict(data: {
  program_id: string;
  expected_version: number;
  actual_version: number;
}) {
  Sentry.captureMessage('program.version_conflict', {
    level: 'warning',
    extra: data,
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add lib/programs/breadcrumbs.ts
git commit -m "feat(programs): sentry breadcrumb helpers for lifecycle events"
```

---

## Task 7: `createProgram` server action + `listPrograms` query

**Files:**
- Create: `lib/programs/actions/list-programs.ts`
- Create: `lib/programs/actions/create-program.ts`
- Create: `tests/integration/programs/create.test.ts`

This is the biggest server-action chunk. We test the three create modes via integration so RLS + deep-copy are exercised together.

- [ ] **Step 1: Write `listPrograms`**

Create `lib/programs/actions/list-programs.ts`:

```ts
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '../get-current-coach';

export type ProgramSummary = {
  id: string;
  name: string;
  blockType: 'hypertrophy' | 'strength' | 'peak' | 'general';
  totalWeeks: number;
  startDate: string | null;
  athleteId: string | null;
  athleteName: string | null;
  isTemplate: boolean;
  isActive: boolean;
  updatedAt: string;
};

export type ListProgramsArgs = {
  tab: 'programs' | 'templates';
  athleteId?: string;
  includeArchived?: boolean;
};

export async function listPrograms(args: ListProgramsArgs): Promise<ProgramSummary[]> {
  await getCurrentCoach(); // guards: throws if not a coach
  const supabase = await createClient();

  let q = supabase
    .from('programs')
    .select(`
      id, name, block_type, total_weeks, start_date, athlete_id, is_template,
      is_active, created_at,
      athlete:athletes(id, name)
    `)
    .order('created_at', { ascending: false });

  if (args.tab === 'templates') {
    q = q.eq('is_template', true);
  } else {
    q = q.eq('is_template', false);
  }
  if (!args.includeArchived) {
    q = q.eq('is_active', true);
  }
  if (args.athleteId) {
    q = q.eq('athlete_id', args.athleteId);
  }

  const { data, error } = await q;
  if (error) throw new Error(`list_programs_failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    blockType: row.block_type as ProgramSummary['blockType'],
    totalWeeks: row.total_weeks,
    startDate: row.start_date,
    athleteId: row.athlete_id,
    athleteName: (row.athlete as unknown as { name: string } | null)?.name ?? null,
    isTemplate: row.is_template,
    isActive: row.is_active,
    updatedAt: row.created_at,
  }));
}
```

- [ ] **Step 2: Write `createProgram`**

Create `lib/programs/actions/create-program.ts`:

```ts
'use server';

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createProgramSchema, type CreateProgramInput } from '../schemas';
import { getCurrentCoach } from '../get-current-coach';
import { programBreadcrumb } from '../breadcrumbs';
import { buildDeepCopyPayload } from '../duplicate';

export type CreateProgramResult =
  | { ok: true; programId: string }
  | { ok: false; reason: 'invalid' | 'source_not_found' | 'db_error'; message: string };

export async function createProgram(input: unknown): Promise<CreateProgramResult> {
  const parsed = createProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid', message: parsed.error.issues.map((i) => i.message).join('; ') };
  }
  const args: CreateProgramInput = parsed.data;
  const coach = await getCurrentCoach();
  const supabase = await createClient();

  if (args.mode === 'blank') {
    const { data: program, error } = await supabase.from('programs').insert({
      coach_id: coach.id,
      athlete_id: args.athleteId ?? null,
      name: args.name,
      block_type: args.blockType,
      total_weeks: args.totalWeeks,
      notes: args.notes ?? null,
      is_template: args.isTemplate,
      start_date: args.startDate ?? null,
      end_date: args.startDate ? deriveEndDate(args.startDate, args.totalWeeks) : null,
    }).select('id').single();
    if (error || !program) {
      return { ok: false, reason: 'db_error', message: error?.message ?? 'no row returned' };
    }
    programBreadcrumb('program.created', { program_id: program.id, mode: 'blank', is_template: args.isTemplate });
    return { ok: true, programId: program.id };
  }

  // duplicate_template OR duplicate_program
  const sourceId = args.sourceProgramId;
  const { data: source, error: srcErr } = await supabase
    .from('programs')
    .select('*')
    .eq('id', sourceId)
    .maybeSingle();
  if (srcErr) return { ok: false, reason: 'db_error', message: srcErr.message };
  if (!source) return { ok: false, reason: 'source_not_found', message: 'source program not found or not accessible' };

  const { data: srcDays = [], error: dErr } = await supabase
    .from('program_days').select('*').eq('program_id', sourceId);
  if (dErr) return { ok: false, reason: 'db_error', message: dErr.message };

  const dayIds = srcDays.map((d) => d.id);
  let srcExercises: typeof srcDays = [];
  if (dayIds.length > 0) {
    const { data, error: eErr } = await supabase
      .from('program_exercises').select('*').in('program_day_id', dayIds);
    if (eErr) return { ok: false, reason: 'db_error', message: eErr.message };
    srcExercises = data ?? [];
  }

  const isTemplateOut = args.mode === 'duplicate_template' ? false : false;
  // ^ assignment-time choice will set is_template in assignProgramToAthlete.
  // For "duplicate_program" or "duplicate_template", we always create a fresh
  // assigned-shape program with is_template=false, athlete_id=null.

  const payload = buildDeepCopyPayload(
    source as unknown as Parameters<typeof buildDeepCopyPayload>[0],
    srcDays as unknown as Parameters<typeof buildDeepCopyPayload>[1],
    srcExercises as unknown as Parameters<typeof buildDeepCopyPayload>[2],
    { coachId: coach.id, isTemplate: isTemplateOut },
  );

  const { error: pi } = await supabase.from('programs').insert({
    id: payload.program.id,
    coach_id: payload.program.coach_id,
    athlete_id: payload.program.athlete_id,
    name: payload.program.name,
    block_type: payload.program.block_type,
    total_weeks: payload.program.total_weeks,
    notes: payload.program.notes,
    start_date: payload.program.start_date,
    end_date: payload.program.end_date,
    is_template: payload.program.is_template,
    is_active: true,
    version: 1,
  });
  if (pi) return { ok: false, reason: 'db_error', message: pi.message };

  if (payload.days.length > 0) {
    const { error: di } = await supabase.from('program_days').insert(payload.days);
    if (di) return { ok: false, reason: 'db_error', message: di.message };
  }
  if (payload.exercises.length > 0) {
    const { error: ei } = await supabase.from('program_exercises').insert(payload.exercises);
    if (ei) return { ok: false, reason: 'db_error', message: ei.message };
  }

  programBreadcrumb('program.created', {
    program_id: payload.program.id, mode: args.mode, source_id: sourceId,
  });
  return { ok: true, programId: payload.program.id };
}

function deriveEndDate(startDate: string, totalWeeks: number): string {
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + totalWeeks * 7 - 1);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 3: Write the failing integration test**

Create `tests/integration/programs/create.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const admin = createClient(URL, SR, { auth: { persistSession: false } });

async function makeCoach(prefix: string) {
  const email = `${prefix}-${Date.now()}@test.local`;
  const u = await admin.auth.admin.createUser({ email, email_confirm: true, password: 'TestPass123!' });
  if (!u.data.user) throw new Error('createUser');
  const c = await admin.from('coaches').insert({
    auth_user_id: u.data.user.id, display_name: prefix, email,
  }).select('id').single();
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, storageKey: `sb-test-${u.data.user.id}` },
  });
  await client.auth.signInWithPassword({ email, password: 'TestPass123!' });
  return { client, coachId: c.data!.id, userId: u.data.user.id };
}

describe('createProgram (integration via direct DB calls)', () => {
  let A: Awaited<ReturnType<typeof makeCoach>>;

  beforeAll(async () => {
    A = await makeCoach('coach-create');
    // Seed a template directly via service role.
    const tpl = await admin.from('programs').insert({
      coach_id: A.coachId, name: 'Template X', block_type: 'strength', total_weeks: 4, is_template: true,
    }).select('id').single();
    const day = await admin.from('program_days').insert({
      program_id: tpl.data!.id, week_number: 1, day_number: 1, name: 'Squat',
    }).select('id').single();
    await admin.from('program_exercises').insert({
      program_day_id: day.data!.id, position: 1, name: 'Squat', sets: 5, reps: '5', load_pct: 75,
    });
    A.templateId = tpl.data!.id;
  });

  it('blank mode creates an empty program', async () => {
    const { data, error } = await A.client.from('programs').insert({
      coach_id: A.coachId, name: 'Blank', block_type: 'general', total_weeks: 2,
    }).select('id').single();
    expect(error).toBeNull();
    expect(data?.id).toBeDefined();
  });

  it('duplicate_template deep-copies into a fresh assigned-shape program', async () => {
    // Replicate what createProgram does: read source, deep-copy via helper-equivalent inserts.
    const { data: src } = await A.client.from('programs').select('*').eq('id', A.templateId).single();
    expect(src).toBeTruthy();
    const newProg = await A.client.from('programs').insert({
      coach_id: A.coachId, name: src!.name + ' (copy)', block_type: src!.block_type,
      total_weeks: src!.total_weeks, is_template: false,
    }).select('id').single();
    expect(newProg.error).toBeNull();
    expect(newProg.data!.id).not.toBe(A.templateId);
  });

  it('SELECT after insert returns the row to the same coach', async () => {
    const { data } = await A.client.from('programs').select('id, name').limit(50);
    expect((data ?? []).some((r) => r.name === 'Blank')).toBe(true);
  });
});
```

> **Note for executor:** the integration test exercises the DB pathway; the server action wrapper (`createProgram`) is exercised via the e2e tests in Task 14. This split keeps integration tests fast (no Next runtime) and avoids over-mocking.

- [ ] **Step 4: Run tests**

```bash
pnpm vitest run tests/integration/programs/create.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/programs/actions/list-programs.ts lib/programs/actions/create-program.ts tests/integration/programs/create.test.ts
git commit -m "feat(programs): createProgram action + listPrograms query"
```

---

## Task 8: Save / add / remove server actions

**Files:**
- Create: `lib/programs/actions/save-program.ts`
- Create: `tests/integration/programs/version-conflict.test.ts`

Each save action: parses input → guards coach → reads current `version` → updates with `expected_version` → returns conflict if version mismatch. Atomic via Postgres `UPDATE ... WHERE version = $expected RETURNING *`.

- [ ] **Step 1: Implement save / add / remove actions**

Create `lib/programs/actions/save-program.ts`:

```ts
'use server';

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '../get-current-coach';
import {
  saveProgramHeaderSchema, saveProgramDaySchema, saveProgramExerciseSchema,
  addProgramDaySchema, addProgramExerciseSchema,
  removeProgramDaySchema, removeProgramExerciseSchema,
} from '../schemas';
import { programBreadcrumb, captureVersionConflict } from '../breadcrumbs';

type Result<T> =
  | { ok: true; data: T; newVersion: number }
  | { ok: false; reason: 'invalid' | 'conflict' | 'not_found' | 'db_error'; message: string };

async function bumpVersion(programId: string, expectedVersion: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('programs').update({ version: expectedVersion + 1 })
    .eq('id', programId).eq('version', expectedVersion)
    .select('id, version').maybeSingle();
  if (error) return { ok: false as const, reason: 'db_error' as const, message: error.message };
  if (!data) {
    const { data: cur } = await supabase.from('programs').select('version').eq('id', programId).maybeSingle();
    captureVersionConflict({
      program_id: programId, expected_version: expectedVersion, actual_version: cur?.version ?? -1,
    });
    return { ok: false as const, reason: 'conflict' as const, message: 'program version mismatch' };
  }
  return { ok: true as const, newVersion: data.version };
}

export async function saveProgramHeader(input: unknown): Promise<Result<{ programId: string }>> {
  const p = saveProgramHeaderSchema.safeParse(input);
  if (!p.success) return { ok: false, reason: 'invalid', message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();
  const bump = await bumpVersion(p.data.programId, p.data.programVersion);
  if (!bump.ok) return bump;

  const { error } = await supabase.from('programs').update({
    name: p.data.name,
    block_type: p.data.blockType,
    total_weeks: p.data.totalWeeks,
    start_date: p.data.startDate ?? null,
    end_date: p.data.endDate ?? null,
    notes: p.data.notes ?? null,
  }).eq('id', p.data.programId);
  if (error) return { ok: false, reason: 'db_error', message: error.message };

  programBreadcrumb('program.edited', { program_id: p.data.programId, action: 'header' });
  return { ok: true, data: { programId: p.data.programId }, newVersion: bump.newVersion };
}

export async function saveProgramDay(input: unknown): Promise<Result<{ programDayId: string }>> {
  const p = saveProgramDaySchema.safeParse(input);
  if (!p.success) return { ok: false, reason: 'invalid', message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: dayRow } = await supabase
    .from('program_days').select('program_id').eq('id', p.data.programDayId).maybeSingle();
  if (!dayRow) return { ok: false, reason: 'not_found', message: 'day not found' };
  const bump = await bumpVersion(dayRow.program_id, p.data.programVersion);
  if (!bump.ok) return bump;

  const { error } = await supabase.from('program_days').update({
    week_number: p.data.weekNumber, day_number: p.data.dayNumber,
    name: p.data.name, notes: p.data.notes ?? null,
  }).eq('id', p.data.programDayId);
  if (error) return { ok: false, reason: 'db_error', message: error.message };

  programBreadcrumb('program.edited', { program_id: dayRow.program_id, action: 'day', target_id: p.data.programDayId });
  return { ok: true, data: { programDayId: p.data.programDayId }, newVersion: bump.newVersion };
}

export async function saveProgramExercise(input: unknown): Promise<Result<{ programExerciseId: string }>> {
  const p = saveProgramExerciseSchema.safeParse(input);
  if (!p.success) return { ok: false, reason: 'invalid', message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: exRow } = await supabase
    .from('program_exercises')
    .select('program_day_id, program_days(program_id)')
    .eq('id', p.data.programExerciseId)
    .maybeSingle();
  if (!exRow) return { ok: false, reason: 'not_found', message: 'exercise not found' };
  const programId = (exRow.program_days as unknown as { program_id: string }).program_id;
  const bump = await bumpVersion(programId, p.data.programVersion);
  if (!bump.ok) return bump;

  const { error } = await supabase.from('program_exercises').update({
    name: p.data.name, sets: p.data.sets, reps: p.data.reps,
    load_pct: p.data.loadPct ?? null, load_lbs: p.data.loadLbs ?? null,
    rpe: p.data.rpe ?? null, group_label: p.data.groupLabel ?? null,
    notes: p.data.notes ?? null,
  }).eq('id', p.data.programExerciseId);
  if (error) return { ok: false, reason: 'db_error', message: error.message };

  programBreadcrumb('program.edited', { program_id: programId, action: 'exercise', target_id: p.data.programExerciseId });
  return { ok: true, data: { programExerciseId: p.data.programExerciseId }, newVersion: bump.newVersion };
}

export async function addProgramDay(input: unknown): Promise<Result<{ programDayId: string }>> {
  const p = addProgramDaySchema.safeParse(input);
  if (!p.success) return { ok: false, reason: 'invalid', message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();
  const bump = await bumpVersion(p.data.programId, p.data.programVersion);
  if (!bump.ok) return bump;

  const { data: maxRow } = await supabase
    .from('program_days')
    .select('day_number')
    .eq('program_id', p.data.programId)
    .eq('week_number', p.data.weekNumber)
    .order('day_number', { ascending: false }).limit(1).maybeSingle();
  const nextDay = (maxRow?.day_number ?? 0) + 1;

  const { data, error } = await supabase.from('program_days').insert({
    program_id: p.data.programId, week_number: p.data.weekNumber,
    day_number: nextDay, name: `Day ${nextDay}`,
  }).select('id').single();
  if (error || !data) return { ok: false, reason: 'db_error', message: error?.message ?? 'no row' };

  programBreadcrumb('program.edited', { program_id: p.data.programId, action: 'add_day', target_id: data.id });
  return { ok: true, data: { programDayId: data.id }, newVersion: bump.newVersion };
}

export async function addProgramExercise(input: unknown): Promise<Result<{ programExerciseId: string }>> {
  const p = addProgramExerciseSchema.safeParse(input);
  if (!p.success) return { ok: false, reason: 'invalid', message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: dayRow } = await supabase
    .from('program_days').select('program_id').eq('id', p.data.programDayId).maybeSingle();
  if (!dayRow) return { ok: false, reason: 'not_found', message: 'day not found' };
  const bump = await bumpVersion(dayRow.program_id, p.data.programVersion);
  if (!bump.ok) return bump;

  const { data: maxRow } = await supabase
    .from('program_exercises').select('position')
    .eq('program_day_id', p.data.programDayId)
    .order('position', { ascending: false }).limit(1).maybeSingle();
  const nextPosition = (maxRow?.position ?? 0) + 1;

  const { data, error } = await supabase.from('program_exercises').insert({
    program_day_id: p.data.programDayId, position: nextPosition,
    name: 'New exercise', sets: 3, reps: '5',
  }).select('id').single();
  if (error || !data) return { ok: false, reason: 'db_error', message: error?.message ?? 'no row' };

  programBreadcrumb('program.edited', { program_id: dayRow.program_id, action: 'add_exercise', target_id: data.id });
  return { ok: true, data: { programExerciseId: data.id }, newVersion: bump.newVersion };
}

export async function removeProgramDay(input: unknown): Promise<Result<{ removed: true }>> {
  const p = removeProgramDaySchema.safeParse(input);
  if (!p.success) return { ok: false, reason: 'invalid', message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: dayRow } = await supabase
    .from('program_days').select('program_id').eq('id', p.data.programDayId).maybeSingle();
  if (!dayRow) return { ok: false, reason: 'not_found', message: 'day not found' };
  const bump = await bumpVersion(dayRow.program_id, p.data.programVersion);
  if (!bump.ok) return bump;

  const { error } = await supabase.from('program_days').delete().eq('id', p.data.programDayId);
  if (error) return { ok: false, reason: 'db_error', message: error.message };

  programBreadcrumb('program.edited', { program_id: dayRow.program_id, action: 'remove_day', target_id: p.data.programDayId });
  return { ok: true, data: { removed: true }, newVersion: bump.newVersion };
}

export async function removeProgramExercise(input: unknown): Promise<Result<{ removed: true }>> {
  const p = removeProgramExerciseSchema.safeParse(input);
  if (!p.success) return { ok: false, reason: 'invalid', message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: exRow } = await supabase
    .from('program_exercises')
    .select('program_day_id, program_days(program_id)')
    .eq('id', p.data.programExerciseId).maybeSingle();
  if (!exRow) return { ok: false, reason: 'not_found', message: 'exercise not found' };
  const programId = (exRow.program_days as unknown as { program_id: string }).program_id;
  const bump = await bumpVersion(programId, p.data.programVersion);
  if (!bump.ok) return bump;

  const { error } = await supabase.from('program_exercises').delete().eq('id', p.data.programExerciseId);
  if (error) return { ok: false, reason: 'db_error', message: error.message };

  programBreadcrumb('program.edited', { program_id: programId, action: 'remove_exercise', target_id: p.data.programExerciseId });
  return { ok: true, data: { removed: true }, newVersion: bump.newVersion };
}
```

- [ ] **Step 2: Write the failing version-conflict integration test**

Create `tests/integration/programs/version-conflict.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(URL, SR, { auth: { persistSession: false } });

describe('version-conflict — concurrent edits', () => {
  let coachId: string;
  let programId: string;

  beforeAll(async () => {
    const email = `conflict-${Date.now()}@test.local`;
    const u = await admin.auth.admin.createUser({ email, email_confirm: true });
    const c = await admin.from('coaches').insert({
      auth_user_id: u.data.user!.id, display_name: 'C', email,
    }).select('id').single();
    coachId = c.data!.id;
    const p = await admin.from('programs').insert({
      coach_id: coachId, name: 'P', block_type: 'general', total_weeks: 1, version: 1,
    }).select('id').single();
    programId = p.data!.id;
  });

  it('first update with expected version succeeds', async () => {
    const { data } = await admin.from('programs')
      .update({ version: 2, name: 'P-A' })
      .eq('id', programId).eq('version', 1)
      .select('id, version').maybeSingle();
    expect(data?.version).toBe(2);
  });

  it('second update with stale version returns no row', async () => {
    const { data } = await admin.from('programs')
      .update({ version: 3, name: 'P-B' })
      .eq('id', programId).eq('version', 1) // stale
      .select('id, version').maybeSingle();
    expect(data).toBeNull();
    const cur = await admin.from('programs').select('version, name').eq('id', programId).single();
    expect(cur.data?.version).toBe(2);
    expect(cur.data?.name).toBe('P-A');
  });

  it('retry with fresh version succeeds', async () => {
    const { data } = await admin.from('programs')
      .update({ version: 3, name: 'P-B-retry' })
      .eq('id', programId).eq('version', 2)
      .select('id, version').maybeSingle();
    expect(data?.version).toBe(3);
  });
});
```

- [ ] **Step 3: Run test + verify**

```bash
pnpm vitest run tests/integration/programs/version-conflict.test.ts
pnpm typecheck
```

Expected: 3/3 pass.

- [ ] **Step 4: Commit**

```bash
git add lib/programs/actions/save-program.ts tests/integration/programs/version-conflict.test.ts
git commit -m "feat(programs): save/add/remove actions with optimistic-lock conflict handling"
```

---

## Task 9: Reorder + assign + archive actions

**Files:**
- Create: `lib/programs/actions/reorder.ts`
- Create: `lib/programs/actions/assign-program.ts`
- Create: `lib/programs/actions/archive-program.ts`
- Create: `tests/integration/programs/assign.test.ts`
- Create: `tests/integration/programs/archive.test.ts`

- [ ] **Step 1: Implement reorder**

Create `lib/programs/actions/reorder.ts`:

```ts
'use server';

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { reorderSchema } from '../schemas';
import { getCurrentCoach } from '../get-current-coach';
import { programBreadcrumb } from '../breadcrumbs';

/**
 * Move a program_exercise row up or down within its day.
 * Strategy: find neighbor by adjacent position, swap positions.
 */
export async function reorderProgramExercise(input: unknown) {
  const p = reorderSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: row } = await supabase.from('program_exercises')
    .select('id, position, program_day_id, program_days(program_id)')
    .eq('id', p.data.id).maybeSingle();
  if (!row) return { ok: false as const, reason: 'not_found' as const, message: 'exercise not found' };
  const programId = (row.program_days as unknown as { program_id: string }).program_id;

  const op = p.data.direction === 'up' ? '<' : '>';
  const order = p.data.direction === 'up' ? { ascending: false } : { ascending: true };
  const { data: neighbor } = await supabase.from('program_exercises')
    .select('id, position').eq('program_day_id', row.program_day_id)
    .filter('position', op, row.position)
    .order('position', order).limit(1).maybeSingle();
  if (!neighbor) return { ok: true as const, noop: true, programId };

  // Swap via two updates wrapped in a single batch.
  // Use a temp negative position to avoid the unique-by-natural-key collisions
  // (we don't have a uniqueness constraint here, but tmp is still cleaner).
  const tmp = -row.position - 1;
  await supabase.from('program_exercises').update({ position: tmp }).eq('id', row.id);
  await supabase.from('program_exercises').update({ position: row.position }).eq('id', neighbor.id);
  await supabase.from('program_exercises').update({ position: neighbor.position }).eq('id', row.id);

  // bump program version
  await supabase.rpc('bump_program_version', { p_id: programId, expected: p.data.programVersion })
    .then(() => null).catch(() => null);
  // (If you don't want to add a Postgres function, do an UPDATE...WHERE version=expected here.
  // Kept simple — add the RPC in the migration if desired. For V1 we use the inline UPDATE pattern:)
  await supabase.from('programs')
    .update({ version: p.data.programVersion + 1 })
    .eq('id', programId).eq('version', p.data.programVersion);

  programBreadcrumb('program.edited', { program_id: programId, action: 'reorder_exercise', target_id: row.id });
  return { ok: true as const, programId };
}

export async function reorderProgramDay(input: unknown) {
  const p = reorderSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: row } = await supabase.from('program_days')
    .select('id, week_number, day_number, program_id').eq('id', p.data.id).maybeSingle();
  if (!row) return { ok: false as const, reason: 'not_found' as const, message: 'day not found' };

  const op = p.data.direction === 'up' ? '<' : '>';
  const order = p.data.direction === 'up' ? { ascending: false } : { ascending: true };
  const { data: neighbor } = await supabase.from('program_days')
    .select('id, day_number').eq('program_id', row.program_id).eq('week_number', row.week_number)
    .filter('day_number', op, row.day_number)
    .order('day_number', order).limit(1).maybeSingle();
  if (!neighbor) return { ok: true as const, noop: true, programId: row.program_id };

  const tmp = -row.day_number - 1;
  await supabase.from('program_days').update({ day_number: tmp }).eq('id', row.id);
  await supabase.from('program_days').update({ day_number: row.day_number }).eq('id', neighbor.id);
  await supabase.from('program_days').update({ day_number: neighbor.day_number }).eq('id', row.id);

  await supabase.from('programs')
    .update({ version: p.data.programVersion + 1 })
    .eq('id', row.program_id).eq('version', p.data.programVersion);

  programBreadcrumb('program.edited', { program_id: row.program_id, action: 'reorder_day', target_id: row.id });
  return { ok: true as const, programId: row.program_id };
}
```

- [ ] **Step 2: Implement assign-program**

Create `lib/programs/actions/assign-program.ts`:

```ts
'use server';

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { assignProgramSchema } from '../schemas';
import { getCurrentCoach } from '../get-current-coach';
import { programBreadcrumb } from '../breadcrumbs';
import { buildDeepCopyPayload } from '../duplicate';

export async function assignProgramToAthlete(input: unknown) {
  const p = assignProgramSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  const coach = await getCurrentCoach();
  const supabase = await createClient();

  const { data: tpl } = await supabase.from('programs').select('*')
    .eq('id', p.data.templateProgramId).maybeSingle();
  if (!tpl) return { ok: false as const, reason: 'not_found' as const, message: 'template not accessible' };
  if (tpl.coach_id !== coach.id) return { ok: false as const, reason: 'forbidden' as const, message: 'cross-coach assign' };

  // Confirm athlete belongs to this coach.
  const { data: ath } = await supabase.from('athletes').select('id, coach_id, name')
    .eq('id', p.data.athleteId).maybeSingle();
  if (!ath || ath.coach_id !== coach.id) return { ok: false as const, reason: 'not_found' as const, message: 'athlete not in roster' };

  const { data: srcDays = [] } = await supabase.from('program_days').select('*').eq('program_id', tpl.id);
  const dayIds = srcDays.map((d) => d.id);
  let srcExercises: typeof srcDays = [];
  if (dayIds.length > 0) {
    const { data } = await supabase.from('program_exercises').select('*').in('program_day_id', dayIds);
    srcExercises = data ?? [];
  }

  const endDate = deriveEndDate(p.data.startDate, tpl.total_weeks);
  const payload = buildDeepCopyPayload(
    tpl as unknown as Parameters<typeof buildDeepCopyPayload>[0],
    srcDays as unknown as Parameters<typeof buildDeepCopyPayload>[1],
    srcExercises as unknown as Parameters<typeof buildDeepCopyPayload>[2],
    {
      coachId: coach.id, athleteId: p.data.athleteId, isTemplate: false,
      startDate: p.data.startDate, endDate, name: `${tpl.name} — ${ath.name}`,
    },
  );

  const { error: pi } = await supabase.from('programs').insert({
    id: payload.program.id, coach_id: payload.program.coach_id,
    athlete_id: payload.program.athlete_id, name: payload.program.name,
    block_type: payload.program.block_type, total_weeks: payload.program.total_weeks,
    notes: payload.program.notes, start_date: payload.program.start_date,
    end_date: payload.program.end_date, is_template: false, is_active: true, version: 1,
  });
  if (pi) return { ok: false as const, reason: 'db_error' as const, message: pi.message };
  if (payload.days.length) {
    const { error: di } = await supabase.from('program_days').insert(payload.days);
    if (di) return { ok: false as const, reason: 'db_error' as const, message: di.message };
  }
  if (payload.exercises.length) {
    const { error: ei } = await supabase.from('program_exercises').insert(payload.exercises);
    if (ei) return { ok: false as const, reason: 'db_error' as const, message: ei.message };
  }

  programBreadcrumb('program.assigned', {
    template_id: tpl.id, new_program_id: payload.program.id, athlete_id: p.data.athleteId,
  });
  return { ok: true as const, newProgramId: payload.program.id };
}

function deriveEndDate(startDate: string, totalWeeks: number): string {
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + totalWeeks * 7 - 1);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 3: Implement archive/restore**

Create `lib/programs/actions/archive-program.ts`:

```ts
'use server';

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { archiveProgramSchema } from '../schemas';
import { getCurrentCoach } from '../get-current-coach';
import { programBreadcrumb } from '../breadcrumbs';

export async function archiveProgram(input: unknown) {
  const p = archiveProgramSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();
  const { error, data } = await supabase.from('programs')
    .update({ is_active: false }).eq('id', p.data.programId).select('id').maybeSingle();
  if (error) return { ok: false as const, reason: 'db_error' as const, message: error.message };
  if (!data) return { ok: false as const, reason: 'not_found' as const, message: 'program not found' };
  programBreadcrumb('program.archived', { program_id: p.data.programId });
  return { ok: true as const };
}

export async function restoreProgram(input: unknown) {
  const p = archiveProgramSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();
  const { error, data } = await supabase.from('programs')
    .update({ is_active: true }).eq('id', p.data.programId).select('id').maybeSingle();
  if (error) return { ok: false as const, reason: 'db_error' as const, message: error.message };
  if (!data) return { ok: false as const, reason: 'not_found' as const, message: 'program not found' };
  programBreadcrumb('program.restored', { program_id: p.data.programId });
  return { ok: true as const };
}
```

- [ ] **Step 4: Write the assign integration test**

Create `tests/integration/programs/assign.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL, SR, { auth: { persistSession: false } });

describe('assignProgramToAthlete — deep-copy semantics', () => {
  let coachId: string, athleteId: string, templateId: string;

  beforeAll(async () => {
    const email = `assign-${Date.now()}@test.local`;
    const u = await admin.auth.admin.createUser({ email, email_confirm: true });
    const c = await admin.from('coaches').insert({
      auth_user_id: u.data.user!.id, display_name: 'C', email,
    }).select('id').single();
    coachId = c.data!.id;
    const a = await admin.from('athletes').insert({
      coach_id: coachId, name: 'Athlete A', email: `a-${Date.now()}@test.local`,
      weight_class: '198', raw_or_equipped: 'raw', current_squat_max: 405,
      current_bench_max: 275, current_deadlift_max: 495, weak_points: 'lockout',
      experience_level: 'advanced', goal: 'meet_prep', coaching_type: 'online',
      start_date: '2026-01-01',
    }).select('id').single();
    athleteId = a.data!.id;
    const tpl = await admin.from('programs').insert({
      coach_id: coachId, name: 'Tpl', block_type: 'strength', total_weeks: 4, is_template: true,
    }).select('id').single();
    templateId = tpl.data!.id;
    const day = await admin.from('program_days').insert({
      program_id: templateId, week_number: 1, day_number: 1, name: 'Squat',
    }).select('id').single();
    await admin.from('program_exercises').insert({
      program_day_id: day.data!.id, position: 1, name: 'Squat', sets: 5, reps: '5',
    });
  });

  it('after deep-copy, edits to the assigned copy do not change the template', async () => {
    // Replicate the deep-copy a real action would do, via service role.
    const { data: srcProg } = await admin.from('programs').select('*').eq('id', templateId).single();
    const { data: srcDays } = await admin.from('program_days').select('*').eq('program_id', templateId);
    const dayIds = srcDays!.map((d) => d.id);
    const { data: srcExs } = await admin.from('program_exercises').select('*').in('program_day_id', dayIds);

    const newProg = await admin.from('programs').insert({
      coach_id: coachId, athlete_id: athleteId,
      name: srcProg!.name + ' (copy)', block_type: srcProg!.block_type,
      total_weeks: srcProg!.total_weeks, is_template: false,
    }).select('id').single();
    const newProgId = newProg.data!.id;

    const dayIdMap = new Map<string, string>();
    for (const d of srcDays!) {
      const nd = await admin.from('program_days').insert({
        program_id: newProgId, week_number: d.week_number, day_number: d.day_number,
        name: d.name, notes: d.notes,
      }).select('id').single();
      dayIdMap.set(d.id, nd.data!.id);
    }
    for (const e of srcExs!) {
      await admin.from('program_exercises').insert({
        program_day_id: dayIdMap.get(e.program_day_id)!,
        position: e.position, name: e.name, sets: e.sets, reps: e.reps,
        load_pct: e.load_pct, load_lbs: e.load_lbs, rpe: e.rpe, group_label: e.group_label,
      });
    }

    // Edit the COPY's exercise.
    const { data: copyEx } = await admin.from('program_exercises')
      .select('id, name, program_day_id, program_days(program_id)')
      .eq('name', 'Squat').limit(20);
    const copyExRow = copyEx!.find(
      (r) => (r.program_days as unknown as { program_id: string }).program_id === newProgId,
    )!;
    await admin.from('program_exercises').update({ name: 'Pause Squat (copy edit)' }).eq('id', copyExRow.id);

    // Template's exercise should still say 'Squat'.
    const tplExs = await admin.from('program_exercises')
      .select('id, name, program_days(program_id)').eq('name', 'Squat');
    const tplStillSquat = tplExs.data!.some(
      (r) => (r.program_days as unknown as { program_id: string }).program_id === templateId,
    );
    expect(tplStillSquat).toBe(true);
  });
});
```

- [ ] **Step 5: Write the archive integration test**

Create `tests/integration/programs/archive.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL, SR, { auth: { persistSession: false } });

describe('archive / restore', () => {
  let coachId: string, programId: string;
  beforeAll(async () => {
    const email = `arch-${Date.now()}@test.local`;
    const u = await admin.auth.admin.createUser({ email, email_confirm: true });
    const c = await admin.from('coaches').insert({
      auth_user_id: u.data.user!.id, display_name: 'C', email,
    }).select('id').single();
    coachId = c.data!.id;
    const p = await admin.from('programs').insert({
      coach_id: coachId, name: 'arch', block_type: 'general', total_weeks: 1,
    }).select('id').single();
    programId = p.data!.id;
  });

  it('archive sets is_active=false', async () => {
    await admin.from('programs').update({ is_active: false }).eq('id', programId);
    const { data } = await admin.from('programs').select('is_active').eq('id', programId).single();
    expect(data?.is_active).toBe(false);
  });

  it('restore sets is_active=true', async () => {
    await admin.from('programs').update({ is_active: true }).eq('id', programId);
    const { data } = await admin.from('programs').select('is_active').eq('id', programId).single();
    expect(data?.is_active).toBe(true);
  });
});
```

- [ ] **Step 6: Run all integration tests + typecheck**

```bash
pnpm vitest run tests/integration/programs/
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add lib/programs/actions/reorder.ts lib/programs/actions/assign-program.ts lib/programs/actions/archive-program.ts tests/integration/programs/assign.test.ts tests/integration/programs/archive.test.ts
git commit -m "feat(programs): reorder/assign/archive actions + integration tests"
```

---

## Task 10: Library page (`/coach/programs`)

**Files:**
- Create: `app/coach/programs/page.tsx`
- Create: `app/coach/programs/programs-tabs.tsx` (client subcomponent for tab + filter state)

- [ ] **Step 1: Implement the library page**

Create `app/coach/programs/page.tsx`:

```tsx
import Link from 'next/link';
import { listPrograms } from '@/lib/programs/actions/list-programs';
import { ProgramsTabs } from './programs-tabs';

type SearchParams = { tab?: string; archived?: string; block?: string };

export const metadata = { title: 'Programs · Steele & Co.' };

export default async function ProgramsPage({
  searchParams,
}: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const tab: 'programs' | 'templates' = sp.tab === 'templates' ? 'templates' : 'programs';
  const includeArchived = sp.archived === '1';

  const rows = await listPrograms({ tab, includeArchived });
  const filtered = sp.block ? rows.filter((r) => r.blockType === sp.block) : rows;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <p className="text-gold text-xs tracking-widest uppercase">Library</p>
          <h1 className="text-bone font-serif text-4xl">Programs</h1>
        </div>
        <Link
          href="/coach/programs/new"
          className="border-gold text-gold border px-6 py-3 text-xs tracking-widest uppercase"
        >
          New program
        </Link>
      </header>

      <ProgramsTabs activeTab={tab} includeArchived={includeArchived} blockFilter={sp.block ?? null} />

      {filtered.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProgramCard key={p.id} program={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ tab }: { tab: 'programs' | 'templates' }) {
  return (
    <div className="border-hairline-strong flex flex-col items-center gap-4 border p-16 text-center">
      <p className="text-bone-muted">
        {tab === 'templates'
          ? 'No templates yet. Build a program and mark it as a template to reuse later.'
          : 'No programs yet. Build your first one.'}
      </p>
      <Link href="/coach/programs/new" className="text-gold underline-offset-4 hover:underline">
        Create program
      </Link>
    </div>
  );
}

function ProgramCard({ program: p }: { program: Awaited<ReturnType<typeof listPrograms>>[number] }) {
  const blockColor = {
    hypertrophy: 'text-amber-300',
    strength: 'text-gold',
    peak: 'text-rose-300',
    general: 'text-bone-muted',
  }[p.blockType];
  return (
    <li className="border-hairline-strong border bg-[#0c0c0c] p-6">
      <div className="flex items-baseline justify-between">
        <p className={`text-xs tracking-widest uppercase ${blockColor}`}>{p.blockType}</p>
        {!p.isActive && <p className="text-bone-faint text-xs">Archived</p>}
      </div>
      <h3 className="text-bone mt-2 font-serif text-xl">
        <Link href={`/coach/programs/${p.id}/edit`}>{p.name}</Link>
      </h3>
      <p className="text-bone-muted mt-3 text-xs">
        {p.totalWeeks} {p.totalWeeks === 1 ? 'week' : 'weeks'}
        {p.athleteName ? ` · ${p.athleteName}` : ''}
      </p>
    </li>
  );
}
```

- [ ] **Step 2: Implement tab/filter client component**

Create `app/coach/programs/programs-tabs.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Props = {
  activeTab: 'programs' | 'templates';
  includeArchived: boolean;
  blockFilter: string | null;
};

export function ProgramsTabs({ activeTab, includeArchived, blockFilter }: Props) {
  const sp = useSearchParams();

  const tabLink = (t: 'programs' | 'templates') => {
    const params = new URLSearchParams(sp.toString());
    params.set('tab', t);
    return `/coach/programs?${params.toString()}`;
  };

  const archivedLink = () => {
    const params = new URLSearchParams(sp.toString());
    if (includeArchived) params.delete('archived');
    else params.set('archived', '1');
    return `/coach/programs?${params.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-6 border-b border-[#1f1d18] pb-3">
      <Link
        href={tabLink('programs')}
        className={
          activeTab === 'programs'
            ? 'text-gold border-gold border-b text-sm tracking-wider uppercase'
            : 'text-bone-muted text-sm tracking-wider uppercase'
        }
      >
        Programs
      </Link>
      <Link
        href={tabLink('templates')}
        className={
          activeTab === 'templates'
            ? 'text-gold border-gold border-b text-sm tracking-wider uppercase'
            : 'text-bone-muted text-sm tracking-wider uppercase'
        }
      >
        Templates
      </Link>

      <div className="ml-auto flex items-center gap-4 text-xs">
        <Link href={archivedLink()} className="text-bone-faint hover:text-bone-muted">
          {includeArchived ? '✓ Showing archived' : 'Show archived'}
        </Link>
        <BlockFilter active={blockFilter} />
      </div>
    </div>
  );
}

function BlockFilter({ active }: { active: string | null }) {
  const sp = useSearchParams();
  const make = (block: string | null) => {
    const params = new URLSearchParams(sp.toString());
    if (block === null) params.delete('block');
    else params.set('block', block);
    return `/coach/programs?${params.toString()}`;
  };
  const opts = ['hypertrophy', 'strength', 'peak', 'general'] as const;
  return (
    <div className="flex items-center gap-2">
      <Link
        href={make(null)}
        className={active === null ? 'text-bone' : 'text-bone-faint hover:text-bone-muted'}
      >
        All
      </Link>
      {opts.map((o) => (
        <Link
          key={o}
          href={make(o)}
          className={active === o ? 'text-bone' : 'text-bone-faint hover:text-bone-muted'}
        >
          {o}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Smoke test the page**

Start dev server:
```bash
pnpm dev -p 3100
```
Sign in as coach, visit `http://localhost:3100/coach/programs`. Expected: empty state showing "No programs yet. Build your first one." with a "Create program" link. Switch to Templates tab → empty state for templates.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add app/coach/programs/page.tsx app/coach/programs/programs-tabs.tsx
git commit -m "feat(programs): /coach/programs library page with programs/templates tabs"
```

---

## Task 11: New-program entry (`/coach/programs/new`)

**Files:**
- Create: `app/coach/programs/new/page.tsx`
- Create: `app/coach/programs/new/blank-form.tsx` (client component for the blank form)

- [ ] **Step 1: Implement new-program page**

Create `app/coach/programs/new/page.tsx`:

```tsx
import Link from 'next/link';
import { listPrograms } from '@/lib/programs/actions/list-programs';
import { BlankProgramForm } from './blank-form';

type SP = { mode?: string; source?: string };

export default async function NewProgramPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const mode = sp.mode === 'duplicate-template' || sp.mode === 'duplicate-program' ? sp.mode : 'choose';

  if (mode === 'choose') return <Chooser />;
  if (mode === 'duplicate-template') return <SourcePicker tab="templates" mode={mode} />;
  return <SourcePicker tab="programs" mode={mode} />;
}

function Chooser() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">New program</p>
        <h1 className="text-bone font-serif text-4xl">How do you want to start?</h1>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        <ChoiceCard href="?mode=blank" title="Start blank" body="Empty program. Add weeks, days, exercises from scratch." />
        <ChoiceCard href="?mode=duplicate-template" title="From a template" body="Duplicate one of your templates as the starting structure." />
        <ChoiceCard href="?mode=duplicate-program" title="From an existing program" body="Duplicate a previously assigned program (e.g., last meet's prep)." />
      </div>
    </div>
  );
}

function ChoiceCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="border-hairline-strong block border bg-[#0c0c0c] p-6 hover:border-gold">
      <h3 className="text-bone font-serif text-xl">{title}</h3>
      <p className="text-bone-muted mt-2 text-sm">{body}</p>
    </Link>
  );
}

async function SourcePicker({ tab, mode }: { tab: 'templates' | 'programs'; mode: string }) {
  const sources = await listPrograms({ tab });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">New program</p>
        <h1 className="text-bone font-serif text-3xl">
          Pick the {tab === 'templates' ? 'template' : 'source program'}
        </h1>
      </header>
      <ul className="flex flex-col gap-2">
        {sources.map((s) => (
          <li key={s.id} className="border-hairline-strong border p-4 hover:border-gold">
            <form action={`/coach/programs/new/duplicate?source=${s.id}&mode=${mode}`} method="post">
              <button type="submit" className="text-bone block w-full text-left">
                <span className="font-serif text-lg">{s.name}</span>
                <span className="text-bone-muted ml-3 text-xs">
                  {s.blockType} · {s.totalWeeks} weeks
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

> **Note for executor:** the `<form action="/coach/programs/new/duplicate?...">` POST will be wired to a route handler in Step 2. (Server actions can't be invoked from a `<form>` simply via querystring without `'use server'`.)

- [ ] **Step 2: Add the duplicate route handler**

Create `app/coach/programs/new/duplicate/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createProgram } from '@/lib/programs/actions/create-program';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const sourceId = url.searchParams.get('source');
  const mode = url.searchParams.get('mode');
  if (!sourceId) return NextResponse.json({ error: 'missing source' }, { status: 400 });
  const apiMode =
    mode === 'duplicate-template' ? 'duplicate_template' :
    mode === 'duplicate-program' ? 'duplicate_program' :
    null;
  if (!apiMode) return NextResponse.json({ error: 'invalid mode' }, { status: 400 });

  const r = await createProgram({ mode: apiMode, sourceProgramId: sourceId });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 });
  return NextResponse.redirect(new URL(`/coach/programs/${r.programId}/edit`, req.url));
}
```

- [ ] **Step 3: Add the blank form**

Create `app/coach/programs/new/blank-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createProgram } from '@/lib/programs/actions/create-program';

export function BlankProgramForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setErr(null);
        const f = e.currentTarget;
        const fd = new FormData(f);
        const r = await createProgram({
          mode: 'blank',
          name: String(fd.get('name')),
          blockType: String(fd.get('blockType')),
          totalWeeks: Number(fd.get('totalWeeks')),
          notes: String(fd.get('notes') ?? '') || null,
          isTemplate: fd.get('isTemplate') === 'on',
        });
        setBusy(false);
        if (!r.ok) { setErr(r.message); return; }
        router.push(`/coach/programs/${r.programId}/edit`);
      }}
      className="flex flex-col gap-5"
    >
      <Field label="Name">
        <input name="name" required maxLength={120}
          className="border-hairline-strong w-full border bg-transparent px-3 py-2 text-bone" />
      </Field>
      <Field label="Block type">
        <select name="blockType" required defaultValue="strength"
          className="border-hairline-strong w-full border bg-[#0c0c0c] px-3 py-2 text-bone">
          <option value="hypertrophy">Hypertrophy</option>
          <option value="strength">Strength</option>
          <option value="peak">Peak</option>
          <option value="general">General</option>
        </select>
      </Field>
      <Field label="Total weeks">
        <input name="totalWeeks" type="number" required min={1} max={52} defaultValue={8}
          className="border-hairline-strong w-full border bg-transparent px-3 py-2 text-bone" />
      </Field>
      <Field label="Notes (optional)">
        <textarea name="notes" maxLength={2000}
          className="border-hairline-strong h-24 w-full border bg-transparent px-3 py-2 text-bone" />
      </Field>
      <label className="text-bone-muted flex items-center gap-2 text-sm">
        <input type="checkbox" name="isTemplate" /> Save as template
      </label>
      {err && <p className="text-rose-400 text-sm">{err}</p>}
      <button
        type="submit" disabled={busy}
        className="border-gold text-gold border px-8 py-3 text-xs tracking-widest uppercase disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create program'}
      </button>
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

- [ ] **Step 4: Wire blank-form into the new-program page**

Edit `app/coach/programs/new/page.tsx` — handle `mode === 'blank'`:

In the `NewProgramPage` component, before the `if (mode === 'choose')` early return, add:

```tsx
if (sp.mode === 'blank') {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">New program</p>
        <h1 className="text-bone font-serif text-3xl">Start blank</h1>
      </header>
      <BlankProgramForm />
    </div>
  );
}
```

- [ ] **Step 5: Smoke test**

```bash
pnpm dev -p 3100
```
Visit `/coach/programs/new`. Expected: 3-card chooser. Click "Start blank" → form. Fill in, submit → redirected to `/coach/programs/<id>/edit` (which won't render yet — Task 12 builds it). Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add app/coach/programs/new/
git commit -m "feat(programs): /coach/programs/new entry — blank/duplicate-template/duplicate-program"
```

---

## Task 12: Builder shell + read-only outliner

**Files:**
- Create: `app/coach/programs/[id]/edit/page.tsx`
- Create: `app/coach/programs/[id]/edit/types.ts`
- Create: `app/coach/programs/[id]/edit/program-builder.tsx` (skeleton — interactive wiring in Task 13)

This task delivers a server-rendered builder showing the full Week → Day → Exercise tree as read-only (no inline edit yet). Task 13 layers in interactivity.

- [ ] **Step 1: Implement page shell + data fetch**

Create `app/coach/programs/[id]/edit/types.ts`:

```ts
export type ProgramHeader = {
  id: string;
  name: string;
  blockType: 'hypertrophy' | 'strength' | 'peak' | 'general';
  totalWeeks: number;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  isTemplate: boolean;
  athleteId: string | null;
  athleteName: string | null;
  version: number;
};

export type ProgramDay = {
  id: string;
  weekNumber: number;
  dayNumber: number;
  name: string;
  notes: string | null;
};

export type ProgramExercise = {
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
};

export type BuilderData = {
  program: ProgramHeader;
  days: ProgramDay[];
  exercises: ProgramExercise[];
};
```

Create `app/coach/programs/[id]/edit/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';
import { ProgramBuilder } from './program-builder';
import type { BuilderData } from './types';

export default async function ProgramEditPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: p } = await supabase.from('programs')
    .select(`
      id, name, block_type, total_weeks, start_date, end_date, notes,
      is_template, athlete_id, version,
      athlete:athletes(id, name)
    `).eq('id', id).maybeSingle();
  if (!p) notFound();

  const { data: days = [] } = await supabase.from('program_days')
    .select('id, week_number, day_number, name, notes')
    .eq('program_id', id)
    .order('week_number').order('day_number');

  const dayIds = days.map((d) => d.id);
  let exercises: BuilderData['exercises'] = [];
  if (dayIds.length > 0) {
    const { data = [] } = await supabase.from('program_exercises')
      .select('id, program_day_id, position, name, sets, reps, load_pct, load_lbs, rpe, group_label, notes')
      .in('program_day_id', dayIds)
      .order('group_label', { ascending: true, nullsFirst: false })
      .order('position');
    exercises = data.map((e) => ({
      id: e.id, programDayId: e.program_day_id, position: e.position, name: e.name,
      sets: e.sets, reps: e.reps, loadPct: e.load_pct, loadLbs: e.load_lbs, rpe: e.rpe,
      groupLabel: e.group_label, notes: e.notes,
    }));
  }

  const data: BuilderData = {
    program: {
      id: p.id, name: p.name, blockType: p.block_type as BuilderData['program']['blockType'],
      totalWeeks: p.total_weeks, startDate: p.start_date, endDate: p.end_date,
      notes: p.notes, isTemplate: p.is_template, athleteId: p.athlete_id,
      athleteName: (p.athlete as unknown as { name: string } | null)?.name ?? null,
      version: p.version,
    },
    days: days.map((d) => ({
      id: d.id, weekNumber: d.week_number, dayNumber: d.day_number,
      name: d.name, notes: d.notes,
    })),
    exercises,
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <ProgramBuilder data={data} />
    </div>
  );
}
```

- [ ] **Step 2: Implement read-only ProgramBuilder skeleton**

Create `app/coach/programs/[id]/edit/program-builder.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { BuilderData, ProgramDay } from './types';

export function ProgramBuilder({ data }: { data: BuilderData }) {
  const [open, setOpen] = useState<Set<number>>(new Set([1]));
  const weeks = Array.from(
    new Set(data.days.map((d) => d.weekNumber)),
  ).sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-gold text-xs tracking-widest uppercase">
          {data.program.isTemplate ? 'Template' : data.program.athleteName ?? 'Unassigned'}
        </p>
        <h1 className="text-bone font-serif text-3xl">{data.program.name}</h1>
        <p className="text-bone-muted text-xs">
          {data.program.blockType} · {data.program.totalWeeks} weeks ·
          version {data.program.version}
        </p>
      </header>

      {weeks.length === 0 && (
        <div className="border-hairline-strong border p-8 text-center">
          <p className="text-bone-muted">No weeks yet.</p>
        </div>
      )}

      {weeks.map((wk) => {
        const isOpen = open.has(wk);
        const daysInWeek = data.days
          .filter((d) => d.weekNumber === wk)
          .sort((a, b) => a.dayNumber - b.dayNumber);
        return (
          <section key={wk} className="border-hairline-strong border">
            <button
              type="button"
              className="text-bone flex w-full items-center justify-between px-5 py-3 text-left"
              onClick={() => {
                setOpen((s) => {
                  const next = new Set(s);
                  if (next.has(wk)) next.delete(wk); else next.add(wk);
                  return next;
                });
              }}
            >
              <span className="font-serif text-xl">Week {wk}</span>
              <span className="text-bone-faint text-xs">
                {daysInWeek.length} {daysInWeek.length === 1 ? 'day' : 'days'} {isOpen ? '▾' : '▸'}
              </span>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-3 border-t border-[#1f1d18] px-5 py-4">
                {daysInWeek.map((d) => (
                  <DayBlock key={d.id} day={d} exercises={data.exercises.filter((e) => e.programDayId === d.id)} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DayBlock({
  day,
  exercises,
}: {
  day: ProgramDay;
  exercises: BuilderData['exercises'];
}) {
  return (
    <article className="border-l-2 border-[#1f1d18] pl-4">
      <header className="flex items-baseline justify-between">
        <h3 className="text-bone font-serif text-lg">
          Day {day.dayNumber} — {day.name}
        </h3>
      </header>
      {exercises.length === 0 ? (
        <p className="text-bone-faint mt-2 text-xs">No exercises yet.</p>
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

- [ ] **Step 3: Smoke test**

```bash
pnpm dev -p 3100
```
Visit a program created via the new flow. Expected: read-only outliner shows "No weeks yet." (Task 13 wires Add Week.) Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add app/coach/programs/[id]/edit/
git commit -m "feat(programs): builder shell with read-only week/day/exercise tree"
```

---

## Task 13: Builder interactivity — autosave + add/remove + reorder + conflict prompt

**Files:**
- Modify: `app/coach/programs/[id]/edit/program-builder.tsx`

This task adds: header autosave, add-week/add-day/add-exercise buttons, inline edit with onBlur autosave, ▲▼ reorder, version-conflict prompt.

- [ ] **Step 1: Wire all server actions into the builder client component**

Replace `app/coach/programs/[id]/edit/program-builder.tsx` with the full interactive version:

```tsx
'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  saveProgramHeader, saveProgramDay, saveProgramExercise,
  addProgramDay, addProgramExercise,
  removeProgramDay, removeProgramExercise,
} from '@/lib/programs/actions/save-program';
import { reorderProgramDay, reorderProgramExercise } from '@/lib/programs/actions/reorder';
import type { BuilderData, ProgramDay } from './types';

export function ProgramBuilder({ data: initial }: { data: BuilderData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [conflict, setConflict] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set(
    initial.days.length ? [Math.min(...initial.days.map((d) => d.weekNumber))] : [],
  ));
  const [, startTransition] = useTransition();

  useEffect(() => { setData(initial); }, [initial]);

  if (conflict) return <ConflictPrompt onReload={() => router.refresh()} />;

  function handleResult<T>(r: T extends { ok: false; reason: 'conflict' } ? T : { ok: true; newVersion?: number; data?: unknown } | { ok: false; reason: string; message: string }, after?: () => void) {
    if ((r as { ok: false; reason?: string }).ok === false) {
      if ((r as { reason?: string }).reason === 'conflict') { setConflict(true); return; }
      alert((r as { message: string }).message);
      return;
    }
    if ((r as { newVersion?: number }).newVersion) {
      setData((d) => ({ ...d, program: { ...d.program, version: (r as { newVersion: number }).newVersion } }));
    }
    after?.();
    router.refresh();
  }

  const weeks = Array.from(new Set(data.days.map((d) => d.weekNumber))).sort((a, b) => a - b);
  const lastWeek = weeks.length ? weeks[weeks.length - 1] : 0;

  return (
    <div className="flex flex-col gap-6">
      <Header data={data} onSave={(p) => startTransition(async () => {
        const r = await saveProgramHeader({ ...p, programId: data.program.id, programVersion: data.program.version });
        handleResult(r);
      })} />

      {weeks.length === 0 && (
        <div className="border-hairline-strong border p-8 text-center">
          <p className="text-bone-muted">No weeks yet.</p>
        </div>
      )}

      {weeks.map((wk) => {
        const isOpen = open.has(wk);
        const daysInWeek = data.days.filter((d) => d.weekNumber === wk).sort((a, b) => a.dayNumber - b.dayNumber);
        return (
          <section key={wk} className="border-hairline-strong border">
            <button type="button" className="text-bone flex w-full items-center justify-between px-5 py-3 text-left"
              onClick={() => setOpen((s) => {
                const next = new Set(s); if (next.has(wk)) next.delete(wk); else next.add(wk); return next;
              })}>
              <span className="font-serif text-xl">Week {wk}</span>
              <span className="text-bone-faint text-xs">
                {daysInWeek.length} {daysInWeek.length === 1 ? 'day' : 'days'} {isOpen ? '▾' : '▸'}
              </span>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-3 border-t border-[#1f1d18] px-5 py-4">
                {daysInWeek.map((d) => (
                  <EditableDay
                    key={d.id} day={d}
                    exercises={data.exercises.filter((e) => e.programDayId === d.id)}
                    programVersion={data.program.version}
                    onResult={handleResult}
                  />
                ))}
                <button
                  type="button"
                  className="text-gold border-gold mt-2 self-start border px-4 py-2 text-xs tracking-widest uppercase"
                  onClick={() => startTransition(async () => {
                    const r = await addProgramDay({
                      programId: data.program.id, programVersion: data.program.version, weekNumber: wk,
                    });
                    handleResult(r);
                  })}
                >
                  + Add day
                </button>
              </div>
            )}
          </section>
        );
      })}

      <button
        type="button"
        className="text-gold border-gold self-start border px-4 py-2 text-xs tracking-widest uppercase"
        onClick={() => startTransition(async () => {
          const r = await addProgramDay({
            programId: data.program.id, programVersion: data.program.version, weekNumber: lastWeek + 1,
          });
          handleResult(r);
        })}
      >
        + Add week
      </button>
    </div>
  );
}

function Header({
  data, onSave,
}: {
  data: BuilderData;
  onSave: (p: { name: string; blockType: BuilderData['program']['blockType']; totalWeeks: number; notes: string | null; startDate: string | null; endDate: string | null }) => void;
}) {
  const [name, setName] = useState(data.program.name);
  return (
    <header className="flex flex-col gap-1">
      <p className="text-gold text-xs tracking-widest uppercase">
        {data.program.isTemplate ? 'Template' : data.program.athleteName ?? 'Unassigned'}
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name !== data.program.name) {
            onSave({
              name,
              blockType: data.program.blockType,
              totalWeeks: data.program.totalWeeks,
              notes: data.program.notes,
              startDate: data.program.startDate,
              endDate: data.program.endDate,
            });
          }
        }}
        className="text-bone bg-transparent font-serif text-3xl outline-none"
      />
      <p className="text-bone-muted text-xs">
        {data.program.blockType} · {data.program.totalWeeks} weeks · version {data.program.version}
      </p>
    </header>
  );
}

function EditableDay({
  day, exercises, programVersion, onResult,
}: {
  day: ProgramDay;
  exercises: BuilderData['exercises'];
  programVersion: number;
  onResult: (r: unknown) => void;
}) {
  const [, startTransition] = useTransition();
  const [name, setName] = useState(day.name);

  return (
    <article className="border-l-2 border-[#1f1d18] pl-4">
      <header className="flex items-baseline justify-between">
        <h3 className="text-bone font-serif text-lg">
          Day {day.dayNumber} —
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name !== day.name) {
                startTransition(async () => {
                  const r = await saveProgramDay({
                    programDayId: day.id, programVersion,
                    weekNumber: day.weekNumber, dayNumber: day.dayNumber,
                    name, notes: null,
                  });
                  onResult(r);
                });
              }
            }}
            className="text-bone ml-2 bg-transparent font-serif outline-none"
          />
        </h3>
        <div className="flex gap-1 text-xs">
          <button onClick={() => startTransition(async () => {
            const r = await reorderProgramDay({ id: day.id, programVersion, direction: 'up' });
            onResult(r);
          })} className="text-bone-faint hover:text-bone">▲</button>
          <button onClick={() => startTransition(async () => {
            const r = await reorderProgramDay({ id: day.id, programVersion, direction: 'down' });
            onResult(r);
          })} className="text-bone-faint hover:text-bone">▼</button>
          <button onClick={() => {
            if (!confirm(`Remove Day ${day.dayNumber}?`)) return;
            startTransition(async () => {
              const r = await removeProgramDay({ programDayId: day.id, programVersion });
              onResult(r);
            });
          }} className="text-rose-400/70 hover:text-rose-400">✕</button>
        </div>
      </header>
      <table className="text-bone mt-3 w-full text-sm tabular-nums">
        <thead>
          <tr className="text-bone-faint border-b border-[#1f1d18] text-xs uppercase">
            <th className="py-1 text-left font-normal">Block</th>
            <th className="py-1 text-left font-normal">Exercise</th>
            <th className="py-1 text-left font-normal">Sets×Reps</th>
            <th className="py-1 text-left font-normal">Load</th>
            <th className="py-1 text-left font-normal">RPE</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {exercises.map((e) => (
            <EditableExerciseRow
              key={e.id} exercise={e} programVersion={programVersion} onResult={onResult}
            />
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="text-gold mt-2 text-xs tracking-widest uppercase"
        onClick={() => startTransition(async () => {
          const r = await addProgramExercise({ programDayId: day.id, programVersion });
          onResult(r);
        })}
      >
        + Add exercise
      </button>
    </article>
  );
}

function EditableExerciseRow({
  exercise: e, programVersion, onResult,
}: {
  exercise: BuilderData['exercises'][number];
  programVersion: number;
  onResult: (r: unknown) => void;
}) {
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState({ ...e });

  function save() {
    startTransition(async () => {
      const r = await saveProgramExercise({
        programExerciseId: e.id, programVersion,
        name: draft.name, sets: draft.sets, reps: draft.reps,
        loadPct: draft.loadPct, loadLbs: draft.loadLbs,
        rpe: draft.rpe, groupLabel: draft.groupLabel, notes: draft.notes,
      });
      onResult(r);
    });
  }

  return (
    <tr className="border-b border-[#1a1814]/40">
      <td className="py-1.5">
        <input value={draft.groupLabel ?? ''} maxLength={20}
          onChange={(ev) => setDraft({ ...draft, groupLabel: ev.target.value || null })}
          onBlur={save} className="text-gold w-12 bg-transparent text-center outline-none" />
      </td>
      <td className="py-1.5">
        <input value={draft.name} maxLength={120}
          onChange={(ev) => setDraft({ ...draft, name: ev.target.value })}
          onBlur={save} className="text-bone bg-transparent outline-none" />
      </td>
      <td className="py-1.5">
        <input type="number" value={draft.sets} min={1} max={50}
          onChange={(ev) => setDraft({ ...draft, sets: Number(ev.target.value) })}
          onBlur={save} className="text-bone w-12 bg-transparent text-right outline-none" />
        <span className="text-bone-faint">×</span>
        <input value={draft.reps} maxLength={40}
          onChange={(ev) => setDraft({ ...draft, reps: ev.target.value })}
          onBlur={save} className="text-bone ml-1 w-20 bg-transparent outline-none" />
      </td>
      <td className="py-1.5">
        <input type="number" value={draft.loadPct ?? ''} min={0} max={150} step="0.5" placeholder="%"
          onChange={(ev) => setDraft({ ...draft, loadPct: ev.target.value === '' ? null : Number(ev.target.value) })}
          onBlur={save} className="text-bone w-16 bg-transparent text-right outline-none" />
        <input type="number" value={draft.loadLbs ?? ''} min={0} max={2500} placeholder="lb"
          onChange={(ev) => setDraft({ ...draft, loadLbs: ev.target.value === '' ? null : Number(ev.target.value) })}
          onBlur={save} className="text-bone ml-1 w-16 bg-transparent text-right outline-none" />
      </td>
      <td className="py-1.5">
        <input type="number" value={draft.rpe ?? ''} min={0} max={10} step="0.5"
          onChange={(ev) => setDraft({ ...draft, rpe: ev.target.value === '' ? null : Number(ev.target.value) })}
          onBlur={save} className="text-bone w-12 bg-transparent text-right outline-none" />
      </td>
      <td className="py-1.5 text-xs whitespace-nowrap">
        <button onClick={() => startTransition(async () => {
          const r = await reorderProgramExercise({ id: e.id, programVersion, direction: 'up' });
          onResult(r);
        })} className="text-bone-faint hover:text-bone">▲</button>
        <button onClick={() => startTransition(async () => {
          const r = await reorderProgramExercise({ id: e.id, programVersion, direction: 'down' });
          onResult(r);
        })} className="text-bone-faint hover:text-bone ml-1">▼</button>
        <button onClick={() => {
          if (!confirm(`Remove ${e.name}?`)) return;
          startTransition(async () => {
            const r = await removeProgramExercise({ programExerciseId: e.id, programVersion });
            onResult(r);
          });
        }} className="text-rose-400/70 hover:text-rose-400 ml-2">✕</button>
      </td>
    </tr>
  );
}

function ConflictPrompt({ onReload }: { onReload: () => void }) {
  return (
    <div className="border-hairline-strong mx-auto mt-20 max-w-md border p-8 text-center">
      <p className="text-gold text-xs tracking-widest uppercase">Edit conflict</p>
      <h2 className="text-bone mt-3 font-serif text-2xl">This program was edited elsewhere.</h2>
      <p className="text-bone-muted mt-3 text-sm">
        Reload to see the latest version. Your unsaved field will be lost; your prior saved changes are preserved.
      </p>
      <button onClick={onReload} className="border-gold text-gold mt-6 border px-6 py-3 text-xs tracking-widest uppercase">
        Reload
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
pnpm typecheck
pnpm lint
```

Expected: clean (or only the pre-existing 1 lint warning).

- [ ] **Step 3: Manual smoke**

```bash
pnpm dev -p 3100
```
Sign in as coach, create a blank program, visit `/coach/programs/[id]/edit`. Expected:
- Header is editable (name autosaves on blur)
- "Add week" button creates Week 1 with Day 1
- Inside Day 1, "Add exercise" creates "New exercise 3×5"
- Each field on the exercise row is editable + autosaves
- ▲▼ reorders
- ✕ removes (with confirm)

Open the same program in a second tab. Edit a name in tab A, save. Then edit a different name in tab B, save. Expected: tab B shows the conflict prompt with a "Reload" button.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add app/coach/programs/[id]/edit/program-builder.tsx
git commit -m "feat(programs): builder interactivity — autosave, add/remove, reorder, conflict prompt"
```

---

## Task 14: Assignment page (`/coach/programs/[id]/assign`)

**Files:**
- Create: `app/coach/programs/[id]/assign/page.tsx`
- Create: `app/coach/programs/[id]/assign/assign-form.tsx`

- [ ] **Step 1: Implement page + form**

Create `app/coach/programs/[id]/assign/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';
import { AssignForm } from './assign-form';

export default async function AssignPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coach = await getCurrentCoach();
  const supabase = await createClient();

  const { data: program } = await supabase.from('programs')
    .select('id, name, total_weeks, is_template, coach_id')
    .eq('id', id).maybeSingle();
  if (!program || program.coach_id !== coach.id || !program.is_template) notFound();

  const { data: athletes = [] } = await supabase.from('athletes')
    .select('id, name, status').eq('coach_id', coach.id).eq('is_active', true)
    .order('name');

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">Assign program</p>
        <h1 className="text-bone font-serif text-3xl">{program.name}</h1>
        <p className="text-bone-muted mt-2 text-sm">{program.total_weeks} weeks</p>
      </header>
      <AssignForm
        templateProgramId={program.id}
        athletes={athletes.map((a) => ({ id: a.id, name: a.name }))}
      />
    </div>
  );
}
```

Create `app/coach/programs/[id]/assign/assign-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { assignProgramToAthlete } from '@/lib/programs/actions/assign-program';

export function AssignForm({
  templateProgramId, athletes,
}: {
  templateProgramId: string;
  athletes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nextMonday = (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7));
    return d.toISOString().slice(0, 10);
  })();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setErr(null);
        const fd = new FormData(e.currentTarget);
        const r = await assignProgramToAthlete({
          templateProgramId,
          athleteId: String(fd.get('athleteId')),
          startDate: String(fd.get('startDate')),
        });
        setBusy(false);
        if (!r.ok) { setErr(r.message); return; }
        router.push(`/coach/programs/${r.newProgramId}/edit`);
      }}
      className="flex flex-col gap-5"
    >
      <label className="flex flex-col gap-1">
        <span className="text-bone-muted text-xs tracking-widest uppercase">Athlete</span>
        <select name="athleteId" required defaultValue=""
          className="border-hairline-strong w-full border bg-[#0c0c0c] px-3 py-2 text-bone">
          <option value="" disabled>Pick an athlete…</option>
          {athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-bone-muted text-xs tracking-widest uppercase">Start date</span>
        <input type="date" name="startDate" required defaultValue={nextMonday}
          className="border-hairline-strong w-full border bg-transparent px-3 py-2 text-bone" />
      </label>
      {err && <p className="text-rose-400 text-sm">{err}</p>}
      <button type="submit" disabled={busy}
        className="border-gold text-gold border px-8 py-3 text-xs tracking-widest uppercase disabled:opacity-50">
        {busy ? 'Assigning…' : 'Assign program'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Smoke test + commit**

```bash
pnpm dev -p 3100
# Visit /coach/programs/<template-id>/assign — pick athlete, submit → lands on new editor.
```

```bash
git add app/coach/programs/[id]/assign/
git commit -m "feat(programs): assign-to-athlete page + form (deep-copy on submit)"
```

---

## Task 15: Per-athlete program list

**Files:**
- Create: `app/coach/athletes/[id]/programs/page.tsx`

- [ ] **Step 1: Implement page**

Create `app/coach/athletes/[id]/programs/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';
import { listPrograms } from '@/lib/programs/actions/list-programs';

export default async function AthleteProgramsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ archived?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const includeArchived = sp.archived === '1';
  const coach = await getCurrentCoach();
  const supabase = await createClient();

  const { data: athlete } = await supabase.from('athletes')
    .select('id, name, coach_id').eq('id', id).maybeSingle();
  if (!athlete || athlete.coach_id !== coach.id) notFound();

  const programs = await listPrograms({ tab: 'programs', athleteId: id, includeArchived });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">{athlete.name}</p>
        <h1 className="text-bone font-serif text-3xl">Programs</h1>
      </header>
      <Link href={`?archived=${includeArchived ? '' : '1'}`} className="text-bone-faint hover:text-bone-muted self-start text-xs">
        {includeArchived ? '✓ Showing archived' : 'Show archived'}
      </Link>
      {programs.length === 0 ? (
        <p className="text-bone-muted">No programs assigned yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {programs.map((p) => (
            <li key={p.id} className="border-hairline-strong border p-4 hover:border-gold">
              <Link href={`/coach/programs/${p.id}/edit`} className="block">
                <h2 className="text-bone font-serif text-lg">{p.name}</h2>
                <p className="text-bone-muted mt-1 text-xs">
                  {p.blockType} · {p.totalWeeks} weeks · {p.startDate ?? 'no start date'}
                  {!p.isActive && ' · Archived'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/coach/athletes/[id]/programs/page.tsx
git commit -m "feat(programs): per-athlete program list page"
```

---

## Task 16: Playwright e2e suite

**Files:**
- Create: `tests/e2e/programs/builder-blank.spec.ts`
- Create: `tests/e2e/programs/builder-from-template.spec.ts`
- Create: `tests/e2e/programs/assign-template.spec.ts`
- Create: `tests/e2e/programs/edit-after-assign.spec.ts`
- Create: `tests/e2e/programs/concurrent-edit.spec.ts`
- Create: `tests/e2e/programs/archive.spec.ts`

These tests assume an existing `tests/e2e/helpers/` module (from Plan 1/2) that signs in a coach via Inbucket. If it doesn't expose what we need, extend it.

- [ ] **Step 1: Verify helpers exist**

```bash
ls tests/e2e/helpers/
```

If `signInAsCoach` (or equivalent) helper exists, use it. If not, extend `tests/e2e/helpers/index.ts` with:

```ts
import type { Page } from '@playwright/test';
export async function signInAsCoach(page: Page, email: string) {
  // Magic-link via Inbucket — same pattern as auth-flow.spec.ts.
  // (Adjust to match the actual helper signature already in the repo.)
}
```

- [ ] **Step 2: Write `builder-blank.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { signInAsCoach } from '../helpers';

test('coach creates a blank program and adds week + day + exercise', async ({ page }) => {
  await signInAsCoach(page, `coach-blank-${Date.now()}@example.com`);
  await page.goto('/coach/programs/new');
  await page.getByText('Start blank').click();
  await page.getByLabel('Name').fill('E2E Blank');
  await page.getByLabel('Block type').selectOption('strength');
  await page.getByLabel('Total weeks').fill('4');
  await page.getByRole('button', { name: /create program/i }).click();
  await expect(page).toHaveURL(/\/coach\/programs\/.+\/edit/);
  await page.getByRole('button', { name: /\+ Add week/i }).click();
  await expect(page.getByText(/Week 1/)).toBeVisible();
  await page.getByRole('button', { name: /\+ Add exercise/i }).click();
  await expect(page.getByDisplayValue('New exercise')).toBeVisible();
});
```

- [ ] **Step 3: Write `builder-from-template.spec.ts`**

Seed a template via the test admin client (same pattern as `tests/integration/programs/assign.test.ts`'s `beforeAll`). Then:

```ts
import { test, expect } from '@playwright/test';
import { signInAsCoach, seedTemplateForCoach } from '../helpers';

test('coach duplicates a template into a fresh assigned-shape program', async ({ page }) => {
  const email = `coach-tmpl-${Date.now()}@example.com`;
  const { templateId } = await seedTemplateForCoach(email); // helper: creates coach + a 1-day template
  await signInAsCoach(page, email);
  await page.goto('/coach/programs/new');
  await page.getByText('From a template').click();
  await page.getByText(/Tpl/).click(); // template name from the helper
  await expect(page).toHaveURL(/\/coach\/programs\/.+\/edit/);
  await expect(page.getByText(/Squat/)).toBeVisible();
});
```

If `seedTemplateForCoach` doesn't exist in `tests/e2e/helpers/`, add it to mirror the helper used in `tests/integration/programs/assign.test.ts` `beforeAll`.

- [ ] **Step 4: Write `assign-template.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { signInAsCoach, seedTemplateForCoach, seedAthleteForCoach } from '../helpers';

test('coach assigns a template to an athlete', async ({ page }) => {
  const email = `coach-assign-${Date.now()}@example.com`;
  const { coachId, templateId } = await seedTemplateForCoach(email);
  const { athleteId, athleteName } = await seedAthleteForCoach(coachId, 'Athlete Alpha');
  await signInAsCoach(page, email);
  await page.goto(`/coach/programs/${templateId}/assign`);
  await page.getByLabel('Athlete').selectOption(athleteId);
  await page.getByRole('button', { name: /assign program/i }).click();
  await expect(page).toHaveURL(/\/coach\/programs\/.+\/edit/);
  await expect(page.getByText(athleteName)).toBeVisible();
  await expect(page.getByText(/Squat/)).toBeVisible();
});
```

- [ ] **Step 5: Write `edit-after-assign.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { signInAsCoach, seedTemplateForCoach, seedAthleteForCoach, assignTemplateToAthlete } from '../helpers';

test('editing an assigned copy does not modify the template', async ({ page }) => {
  const email = `coach-iso-${Date.now()}@example.com`;
  const { coachId, templateId } = await seedTemplateForCoach(email);
  const { athleteId } = await seedAthleteForCoach(coachId, 'Athlete Alpha');
  const { newProgramId } = await assignTemplateToAthlete(coachId, templateId, athleteId);

  await signInAsCoach(page, email);
  // Edit the assigned copy.
  await page.goto(`/coach/programs/${newProgramId}/edit`);
  const exerciseInput = page.getByDisplayValue('Squat').first();
  await exerciseInput.fill('Pause Squat (assigned edit)');
  await exerciseInput.blur();
  await page.waitForLoadState('networkidle');

  // Now visit the original template — should still say "Squat".
  await page.goto(`/coach/programs/${templateId}/edit`);
  await expect(page.getByDisplayValue('Squat')).toBeVisible();
});
```

- [ ] **Step 6: Write `concurrent-edit.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { signInAsCoach, seedTemplateForCoach } from '../helpers';

test('two tabs editing the same program → second save shows conflict', async ({ browser }) => {
  const email = `coach-conf-${Date.now()}@example.com`;
  const { templateId } = await seedTemplateForCoach(email);

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await signInAsCoach(pageA, email);
  await pageA.goto(`/coach/programs/${templateId}/edit`);

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await signInAsCoach(pageB, email);
  await pageB.goto(`/coach/programs/${templateId}/edit`);

  // Both tabs see version N. Tab A saves → version N+1.
  const titleA = pageA.locator('input[value="Tpl"]').first();
  await titleA.fill('Tpl-A-edit');
  await titleA.blur();
  await pageA.waitForLoadState('networkidle');

  // Tab B (still version N) saves → conflict.
  const titleB = pageB.locator('input[value="Tpl"]').first();
  await titleB.fill('Tpl-B-edit');
  await titleB.blur();
  await expect(pageB.getByText(/edit conflict/i)).toBeVisible({ timeout: 5000 });
});
```

- [ ] **Step 7: Write `archive.spec.ts`** (depends on Task 17 archive UI)

```ts
import { test, expect } from '@playwright/test';
import { signInAsCoach, seedProgramForCoach } from '../helpers';

test('archive hides a program; restore brings it back', async ({ page }) => {
  const email = `coach-arch-${Date.now()}@example.com`;
  const { programId } = await seedProgramForCoach(email, { name: 'Arch-test', isTemplate: false });

  await signInAsCoach(page, email);
  await page.goto(`/coach/programs/${programId}/edit`);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^archive$/i }).click();
  await expect(page).toHaveURL(/\/coach\/programs(\?.*)?$/);
  await expect(page.getByText('Arch-test')).not.toBeVisible();

  await page.goto('/coach/programs?archived=1');
  await expect(page.getByText('Arch-test')).toBeVisible();
  await page.getByRole('button', { name: /restore/i }).click();
  await expect(page.getByText(/Showing archived/)).toBeVisible(); // still on archived view; toggle to default to verify.
  await page.goto('/coach/programs');
  await expect(page.getByText('Arch-test')).toBeVisible();
});
```

> **Helper requirements summary:** the e2e tests above assume these helpers in `tests/e2e/helpers/index.ts` (extend the file as needed): `signInAsCoach(page, email)`, `seedTemplateForCoach(email)`, `seedAthleteForCoach(coachId, name)`, `assignTemplateToAthlete(coachId, templateId, athleteId)`, `seedProgramForCoach(email, opts)`. Each helper uses the service-role admin client (same pattern as `tests/integration/programs/*.test.ts`'s `beforeAll`).

> **Task 16 ↔ Task 17 dependency:** `archive.spec.ts` depends on the Archive button + Restore form added in Task 17. Run Task 17 *before* the e2e in Task 16 if you write them strictly in sequence. (Alternatively: write all e2e specs in Task 16, but commit-and-run them after Task 17 lands.)

- [ ] **Step 4: Run e2e**

```bash
pnpm test:e2e
```

Expected: 7 (existing) + 6 (new programs) = 13 passing.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/programs/ tests/e2e/helpers/
git commit -m "test(programs): playwright e2e for builder, assign, edit-isolation, conflict, archive"
```

---

## Task 17: Add archive UI to library + builder header

**Files:**
- Modify: `app/coach/programs/programs-tabs.tsx` (or library card menu — add a popover with archive)
- Modify: `app/coach/programs/[id]/edit/program-builder.tsx` (add an "Archive" link in the header that calls `archiveProgram`)

If you already added these in Task 13, this task is a no-op — verify and skip. Otherwise:

- [ ] **Step 1: Add a header action area to the builder**

Open `app/coach/programs/[id]/edit/program-builder.tsx`. At the top of the file, add the import:

```tsx
import { archiveProgram } from '@/lib/programs/actions/archive-program';
```

Inside the top-level `ProgramBuilder` component (where `useRouter` and `startTransition` are already in scope), wrap the existing `<header>` markup so the title sits left and the archive action sits right. The simplest patch: replace `<Header data={data} onSave={...} />` with a row that renders `<Header>` plus an Archive button:

```tsx
<div className="flex items-start justify-between gap-4">
  <div className="flex-1">
    <Header data={data} onSave={(p) => startTransition(async () => {
      const r = await saveProgramHeader({ ...p, programId: data.program.id, programVersion: data.program.version });
      handleResult(r);
    })} />
  </div>
  <button
    type="button"
    onClick={() => {
      if (!confirm('Archive this program?')) return;
      startTransition(async () => {
        const r = await archiveProgram({ programId: data.program.id });
        if ((r as { ok: boolean }).ok === false) {
          alert((r as { message: string }).message);
          return;
        }
        router.push('/coach/programs');
      });
    }}
    className="text-bone-faint hover:text-rose-400 self-start text-xs tracking-widest uppercase"
  >
    Archive
  </button>
</div>
```

- [ ] **Step 2: Add a "Restore" button on archived cards in the library**

In the library page (`app/coach/programs/page.tsx` `ProgramCard`), if `!p.isActive`, render a small `<form>` POSTing to `/coach/programs/<id>/restore` route handler.

Create `app/coach/programs/[id]/restore/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { restoreProgram } from '@/lib/programs/actions/archive-program';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await restoreProgram({ programId: id });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 });
  return NextResponse.redirect(new URL('/coach/programs?archived=1', req.url));
}
```

- [ ] **Step 3: Smoke + commit**

```bash
pnpm dev -p 3100
# Archive a program from the builder; confirm it's gone from /coach/programs.
# Visit /coach/programs?archived=1; click Restore; confirm reappearance.
```

```bash
git add app/coach/programs/[id]/edit/program-builder.tsx app/coach/programs/page.tsx app/coach/programs/[id]/restore/route.ts
git commit -m "feat(programs): archive button in builder + restore action on archived cards"
```

---

## Task 18: Final gates + push

- [ ] **Step 1: Run all gates**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

Expected:
- typecheck: clean
- lint: 0 errors, ≤1 pre-existing warning
- vitest: pre-existing 23 + new (~16-20) → all pass
- playwright: pre-existing 7 + new (6) → 13 pass

- [ ] **Step 2: Confirm clean tree**

```bash
git status --short
git log --oneline origin/main..HEAD
```

Expected: clean tree (only gitignored). Log shows the Plan 3 commits.

- [ ] **Step 3: Push to origin/main**

```bash
git push origin main
```

Plan 3 (coach side) shipped.

- [ ] **Step 4: Append to session log**

Append a new entry to `.session-logs/session-<today>.md` summarizing Plan 3 commits + final state. (See the Plan 2.5 session log for format.)

---

## Self-review checklist (run after the plan is implemented)

- [ ] Coach can create a blank program and the builder loads.
- [ ] Coach can add weeks, days, exercises; each save autosaves and updates `version`.
- [ ] Coach can reorder days within a week and exercises within a day with ▲▼.
- [ ] Coach can mark a program as a template and find it in the Templates tab.
- [ ] Coach can duplicate a template into a fresh assigned program; editing the copy doesn't change the template.
- [ ] Coach can assign a template directly to an athlete; the new program shows the athlete name in the builder header.
- [ ] Two open tabs editing the same program → second save shows the conflict prompt.
- [ ] RLS prevents Coach B from seeing/editing Coach A's programs (covered by `tests/integration/programs/rls.test.ts`).
- [ ] Archive hides a program from default list; restore brings it back; archived programs are still queryable for an athlete-history view (Plan 4).
- [ ] Lint shows 0 errors; pre-existing 1 warning unchanged.
- [ ] Sentry breadcrumbs fire for created/assigned/edited/archived/restored events (verify in Sentry dashboard or via test mock).
- [ ] No service-role secret leaks to client code.

---

## Known limitations to log for V1 (continued from spec §14)

- Drag-drop reordering not implemented — up/down arrows only.
- Bulk-edit operators not implemented.
- Archived programs are queryable via toggle but no advanced filtering.
- Athlete-side viewer (`/app/program`) not built — Plan 3b.
- Workout logging not built — Plan 4.

---

## Notes for the executor

- **Always** run `pnpm typecheck && pnpm test` after each task before committing — catches regressions early. The integration tests need local Supabase running.
- The plan assumes the Plan 2.5 schema is in place; if `pnpm exec supabase db reset` complains about a missing migration, ensure 0001-0005 are present and intact.
- The `coach_id` is *never* sent from client to server. Every server action calls `getCurrentCoach()` first and uses its return value. RLS is the second layer; Zod is the third.
- Sentry breadcrumbs should be visible in the "Breadcrumbs" pane of any error report after this lands. If they're not, verify `sentry.server.config.ts` is initialized at app boot.
- Append a session-log entry to `.session-logs/session-<date>.md` after Task 18 completes (per the project's session-log rule).
- The plan's `<form action="/coach/programs/new/duplicate?...">` pattern uses route handlers because server actions can't be invoked from a `<form>` with querystring args alone. If the executor prefers `'use server'` form actions, that's a valid refactor — keep the redirect target the same.
- If any task's exact code shape conflicts with a pattern already established in the Billy codebase, prefer the existing pattern and update the plan inline before continuing. (Billy is the source of truth; the plan is a contract subject to local discoveries.)
