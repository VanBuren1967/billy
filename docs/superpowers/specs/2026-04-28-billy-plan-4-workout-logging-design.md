# Plan 4 — Workout Logging: Design Spec

**Date:** 2026-04-28
**Status:** Design (pending user review → implementation plan)
**Builds on:** Plan 1, Plan 2, Plan 2.5, Plan 3 (coach programs), Plan 3b (athlete viewer — shipped 2026-04-28).
**Reference:** `docs/superpowers/specs/2026-04-25-billy-coaching-platform-design.md` §6.3 logging schema, §8.4 athlete-logs-workout flow.

---

## 1. Goal

Athletes can record what they actually did each set: weight, reps, RPE. The logger autosaves on every input change so closing a phone tab mid-workout doesn't lose data. Coaches see completed/in-progress logs on the athlete detail page. After this plan, the full coach-builds → athlete-views → athlete-logs → coach-reviews loop is shippable as V1 MVP.

---

## 2. Scope

### In scope

- **Schema:** `workout_logs` + `set_logs` tables per V1 §6.3, with RLS.
- **RLS:** athletes CRUD their own logs; coaches SELECT logs of their own athletes.
- **`/app/workout/[program_day_id]`** — full logger UI. Set-by-set entry (weight, reps, RPE), autosave on blur, mark-complete button.
- **`/app` dashboard updates:** Today's Workout card links "Log workout" or shows "Completed" if done.
- **`/app/program` updates:** completed days show a checkmark badge.
- **Coach-side view:** the existing `app/coach/athletes/[id]/page.tsx` athlete detail page gets a "Recent Workouts" section showing the last 10 completed/in-progress logs with athlete-supplied notes.
- **Locking:** completed days lock — athlete cannot edit their own logged set rows after marking complete (coach can edit if needed via a separate flow — deferred to V1.5).
- **Tests:** vitest integration for RLS + auto-save semantics + completion idempotency, Playwright e2e for "athlete logs a workout" + "coach sees the log".

### Out of scope (deferred)

- **Coach editing athlete's logs** — V1.5+. Athletes own their data.
- **e1RM calculation, progress charts** — separate plan (data captured here is the foundation).
- **Photo upload per set** — V2 (the design spec mentions photos for inspectors, not athletes).
- **Apple Health / Google Fit integration** — V2.
- **Bulk-edit logs ("redo last set")** — UI sugar deferred.
- **"Copy yesterday's logs"** — V1.5 feature, low value for the V1 MVP loop.
- **Workout reminders / push notifications** — V1.5+ (Plan 5 territory).
- **Per-set rest timer** — V2 polish.
- **Athlete profile metadata fields** (`current_squat_max`, etc.) — Plan 3.5 still TBD. Plan 4 ships without them; logger displays prescribed loads as configured (`75%` or `185 lb`).
- **Locked-day visual on builder for the coach** (already partially implemented in Plan 3 via `is_active` semantics; full locking comes when needed).
- **Editing historical logs after some grace period** — V1: always editable until coach archives. Simplest mental model.

---

## 3. Decisions

| Decision | Value | Why |
|---|---|---|
| Single workout_log per (athlete_id, program_day_id) | UNIQUE constraint | Matches V1 spec §6.3. One log per athlete per scheduled day. |
| Set-log row per (workout_log_id, program_exercise_id, set_number) | UNIQUE constraint | Predictable structure; per-set records. |
| When does workout_log get created? | First save (i.e., first set entered or "Start" clicked) — not on page-load | Avoids littering the DB with empty rows for athletes who navigated then bailed. |
| Auto-creation of N set_logs based on prescription | When workout_log is created, server pre-creates `program_exercise.sets` set_log rows per exercise (status not_started / completed=false) | Stable IDs let the autosave update specific rows. |
| Status enum on workout_logs | `not_started` (implicit — no row) / `in_progress` (started, not marked complete) / `completed` / `skipped` | Per V1 §6.3. |
| Mark-complete idempotency | Setting `completed_at` only the first time; subsequent marks no-op | Avoids overwriting a real timestamp if the athlete double-taps. |
| Locking after complete | UI-side: inputs read-only; RLS UPDATE policy still allows athlete to undo via "Reopen" button | Athletes own their data and can correct mistakes. |
| Reopen button | Available on completed logs, sets `completed_at = null`, status back to `in_progress` | Soft lock with escape hatch. |
| Pain notes | Per workout_log (not per set) | Athletes report pain at session level, not set level. |
| General notes | Per workout_log | Same. |
| RPE | Per set, optional, 0-10 scale | Per V1 spec data model. |
| Reps_done | Per set, integer | Required field at log time. AMRAP prescriptions still write a single integer (the actual reps done). |
| Weight_lbs | Per set, numeric, required if log row is being saved | Athletes are recording what they did. Required at save-time. |
| Coach side: where does workout history live? | Inline section on `/coach/athletes/[id]` detail page, "Recent Workouts" — no new route | V1 spec §7 hinted at tabs but inlining is faster + simpler for the small data volume. Tabs come in V1.5 polish. |
| Set-numbering invariant | If coach changes `program_exercises.sets` from 5 → 4 mid-program, existing logs keep their set_number rows; the 5th set_log becomes orphaned-but-readable | Athletes' history is sacred. Coach's edit doesn't retroactively delete log data. |
| Display unit (lbs vs kg) | lbs always (storage + display) for V1 | V1 simplification. kg toggle is V1.5 (Plan 3.5 / profile metadata work). |
| Validation | Zod on every server action | Matches Plans 3 / 3b conventions. |
| Authorization | Server-derived athlete_id via getCurrentAthlete | No client-supplied athlete_id. |
| Coach can edit athlete logs? | **No in V1.** Coach reads only. | Athletes own their data. V1.5 may add an edit-with-attribution flow. |
| Sentry breadcrumbs | `workout.started`, `workout.set_saved`, `workout.completed`, `workout.reopened` | Lifecycle audit trail (same pattern as Plan 3). |
| Concurrent edits | No optimistic locking on logs (rare contention; one athlete, one device usually) | KISS. If it becomes a problem in V1.5+, add optimistic-lock semantics like Plan 3's. |

---

## 4. Schema changes

Migration: `supabase/migrations/0011_workout_and_set_logs.sql`.

### 4.1 `workout_logs` table

```sql
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
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger workout_logs_bump_updated_at
  before update on public.workout_logs
  for each row execute function public.bump_workout_logs_updated_at();
```

`program_day_id` uses `ON DELETE RESTRICT` — once an athlete logs against a program day, the coach can't hard-delete that day. Forces archival rather than deletion.

### 4.2 `set_logs` table

```sql
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
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_logs_bump_updated_at
  before update on public.set_logs
  for each row execute function public.bump_set_logs_updated_at();
```

`program_exercise_id` uses `ON DELETE RESTRICT` — same locking principle.

### 4.3 RLS — workout_logs

```sql
alter table public.workout_logs enable row level security;

-- Athlete: full CRUD on own logs.
create policy workout_logs_athlete_select on public.workout_logs
  for select using (athlete_id = public.auth_athlete_id());
create policy workout_logs_athlete_insert on public.workout_logs
  for insert with check (athlete_id = public.auth_athlete_id());
create policy workout_logs_athlete_update on public.workout_logs
  for update using (athlete_id = public.auth_athlete_id())
  with check (athlete_id = public.auth_athlete_id());
create policy workout_logs_athlete_delete on public.workout_logs
  for delete using (athlete_id = public.auth_athlete_id());

-- Coach: SELECT logs of their own athletes.
create policy workout_logs_coach_select on public.workout_logs
  for select using (athlete_id in (
    select id from public.athletes where coach_id = public.auth_coach_id()
  ));
```

### 4.4 RLS — set_logs

Same shape, traversal through workout_logs:

```sql
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

---

## 5. Page map

| Route | Purpose |
|---|---|
| `/app/workout/[program_day_id]` | The logger. Server-rendered shell + client component for set entry. |
| `/app` (modify) | Today's Workout card now links "Log workout" → `/app/workout/<today's program_day_id>` if present, "Completed" badge if done. |
| `/app/program` (modify) | Each day card shows a small ✓ if its log is completed. Optional "Log" link. |
| `/coach/athletes/[id]` (modify) | Add "Recent Workouts" section: last 10 logs with date, status, notes. |

---

## 6. User flows

### 6.1 Athlete logs a workout

1. Athlete on `/app` taps Today's Workout card → routes to `/app/workout/<id>`.
2. Server checks for existing workout_log for (athlete_id, program_day_id). If none, create one with status='in_progress' + pre-create N set_log rows per program_exercise with `completed=false`.
3. Athlete sees the prescribed exercises with empty per-set rows. Each row has weight, reps, RPE inputs + "Done" toggle.
4. Athlete enters set 1: types 225, 5, RPE 7. Each input autosaves on blur. Toggles "Done" → `completed=true`.
5. Repeats for each set. Pain notes and general notes are session-level (one set of fields at the bottom).
6. Athlete taps "Mark complete" → `workout_logs.status='completed', completed_at=now()`.
7. Lands back on `/app` with a success indicator.

### 6.2 Athlete reopens a completed workout

1. From `/app/workout/<id>` (already completed) → "Reopen" button visible.
2. Tap → status=`in_progress`, completed_at=null. Inputs become editable again.

### 6.3 Coach reviews athlete's logs

1. Coach on `/coach/athletes/<id>` → scrolls to "Recent Workouts" section.
2. Sees last 10 logs: date, day name, status (✓ done / in progress), athlete-supplied pain & general notes excerpts.
3. Click a log → expanded view (could be a modal or a separate route — V1: inline expand showing all set_logs).

### 6.4 Athlete with no scheduled workout today

1. `/app` Today card shows "Rest day" (existing Plan 3b behavior).
2. No `/app/workout/<id>` link.

### 6.5 Coach edits prescription mid-program

1. Coach changes `program_exercise.sets` from 5 to 4. Existing set_logs are NOT touched (per spec §3 invariant).
2. Athlete's already-logged 5 set_logs remain visible in their history.
3. Future workouts of this exercise (same program_day) — actually, edits to past program_days are tricky: if athlete already logged it, the program_exercise still exists (FK ON DELETE RESTRICT prevents removal), so set_logs stay valid. If coach changes the prescription mid-day, the athlete sees the new values on next refresh.

---

## 7. Security & RLS

Threat model (covered by RLS):
- Athlete A reading Athlete B's logs (cross-tenant)
- Athlete tampering with logs to claim they hit numbers they didn't (within their own data — RLS allows; coach trust model handles this)
- Coach reading another coach's athletes' logs (cross-coach)
- Athlete writing logs against a program_day they don't own (athlete RLS blocks via workout_log → athlete_id check)

Defenses:
- Middleware (`proxy.ts`) gates `/app/*` to authenticated users.
- `getCurrentAthlete()` server-side validates role on every server action.
- RLS as second-layer enforcement.
- Zod validation on all server actions.

---

## 8. Server actions

| Function | Purpose |
|---|---|
| `getOrCreateWorkoutLog(programDayId)` | Idempotent: returns existing log or creates one + pre-populates set_logs from program_exercises. Returns the full tree {workoutLog, setLogs[]}. |
| `saveSetLog({setLogId, weight_lbs, reps_done, rpe, completed})` | Updates a single set_log. Zod-validated. RLS verifies ownership. |
| `saveWorkoutNotes({workoutLogId, painNotes, generalNotes})` | Updates pain/general notes on the workout_log. |
| `markWorkoutComplete({workoutLogId})` | Sets status='completed', completed_at=now(). Idempotent. |
| `reopenWorkout({workoutLogId})` | Sets status='in_progress', completed_at=null. |
| `listRecentWorkoutLogs({athleteId, limit=10})` | Coach-side query. Returns the most recent N logs for an athlete, with status + notes summary. |

---

## 9. Validation

Per server action, in `lib/workouts/schemas.ts`:

```ts
import { z } from 'zod';

export const saveSetLogSchema = z.object({
  setLogId: z.string().uuid(),
  weightLbs: z.number().min(0).max(2500).optional().nullable(),
  repsDone: z.number().int().min(0).max(200).optional().nullable(),
  rpe: z.number().min(0).max(10).optional().nullable(),
  completed: z.boolean().optional(),
});

export const saveWorkoutNotesSchema = z.object({
  workoutLogId: z.string().uuid(),
  painNotes: z.string().max(2000).optional().nullable(),
  generalNotes: z.string().max(2000).optional().nullable(),
});

export const markWorkoutCompleteSchema = z.object({
  workoutLogId: z.string().uuid(),
});

export const getOrCreateWorkoutLogSchema = z.object({
  programDayId: z.string().uuid(),
});
```

---

## 10. Observability

Sentry breadcrumbs from server actions:
- `workout.started` — first call to `getOrCreateWorkoutLog` that creates a row
- `workout.set_saved` — every `saveSetLog` (rate-limit if needed; ~30 events per workout is fine)
- `workout.completed` — `markWorkoutComplete`
- `workout.reopened` — `reopenWorkout`

---

## 11. Test plan

### 11.1 Vitest unit (~3-4 tests)

| File | Tests |
|---|---|
| `tests/unit/workouts/schemas.test.ts` | accepts valid set save · rejects rpe > 10 · rejects negative reps · accepts AMRAP-style high reps |

### 11.2 Vitest integration (~6-8 tests)

| File | Tests |
|---|---|
| `tests/integration/workouts/rls.test.ts` | Athlete A can SELECT their own workout_logs · Athlete A cannot SELECT Athlete B's · Coach can SELECT logs of their athletes · Coach cannot SELECT logs of other coach's athletes · set_logs traverse correctly |
| `tests/integration/workouts/lifecycle.test.ts` | getOrCreateWorkoutLog idempotency · pre-creates set_logs for all program_exercise sets · markComplete sets timestamp once · reopen resets timestamp |

### 11.3 Playwright e2e (~3 tests)

| File | Tests |
|---|---|
| `tests/e2e/workouts/log-workout.spec.ts` | Athlete signs in, taps Today card, logs all sets, marks complete, sees "Completed" badge on /app |
| `tests/e2e/workouts/coach-sees-log.spec.ts` | After athlete logs, coach signs in, visits /coach/athletes/<id>, sees the workout in Recent Workouts |
| `tests/e2e/workouts/reopen.spec.ts` | Completed log can be reopened and edited |

---

## 12. UX principles

The logger is mobile-first per Plan 3b's stance. Athletes use phones at the gym.

1. **Ridiculously easy to enter a set.** Tap to focus, type three digits, tab/blur, autosave. No "save" button per row.
2. **Numeric keyboards** — `inputmode="numeric"` on weight/reps inputs.
3. **Big tap targets** for "Done" toggles (≥48px).
4. **No modals.** Mark complete at the bottom of the page.
5. **Visible autosave indicator** — small "Saved" pill or last-save-time stamp. Athletes need to trust that data didn't vanish.
6. **Vault aesthetic** preserved — black bg, gold accents, serif headlines.
7. **Locked state visually distinct.** Completed logs render with a subtle gold checkmark, dimmed inputs, and a "Reopen" button.
8. **Tabular numerals** on weight/reps/RPE columns.

---

## 13. Edge cases

| Case | Handling |
|---|---|
| Athlete starts logger then abandons mid-workout | workout_log row stays in `in_progress`. Returns to `/app/workout/<id>` later → resumes where they left off. |
| Athlete tries to log a workout for a future day | `program_day` exists; nothing prevents logging. Could add a UI guard ("That's not today") in V1.5. |
| Athlete logs a workout for a past day | Same as above — allowed for V1. Catches up on missed sessions. |
| Coach changes prescription after athlete has logged | Athlete's set_logs preserved. Future logger pages show new prescription. |
| Athlete deletes their account (V1.5) | `ON DELETE CASCADE` from athletes → workout_logs cascades to set_logs. History is gone. |
| Athlete `auth_user_id` is null but workout_log row exists | Shouldn't happen (athletes who haven't accepted invite can't sign in to log). RLS would deny. |
| Concurrent saves on the same set | No optimistic locking; last-write-wins. Atypical (one device, one athlete). |
| Network glitch mid-save | Plan 4's autosave fires + ignores transient failures, retries on next blur. Toast shown after 3 fails. |
| Coach archives the program mid-workout | Athlete's open log persists. RLS still allows their CRUD via athlete_id. |

---

## 14. Performance

- Logger initial paint: < 800ms with up to 8 exercises × 5 sets = 40 rows.
- saveSetLog round-trip: < 300ms p50.
- Coach's "Recent Workouts" query: single SELECT on workout_logs with embedded program_day name; LIMIT 10.

---

## 15. Out of scope (V1.5+)

(Restating §2 deferred list.)

- Coach editing athlete logs.
- e1RM / progress charts.
- Photos per set.
- Health-app integration.
- Bulk-edit logs.
- Copy-yesterday's-logs.
- Workout reminders.
- Per-set rest timer.
- Athlete profile metadata (Plan 3.5).

---

## 16. Open questions / defaults applied

| Question | Default | Owner |
|---|---|---|
| Should weight be required at save time, or accept partial logs? | **Optional** — athletes may log only RPE or notes for accessory work. | OK. |
| Should "Mark complete" require all sets to have weight+reps? | **No** — soft-complete. Allow incomplete sessions. | OK; revisit if data quality suffers. |
| Should RPE field default to last-set's value? | **No** — empty by default. | OK; could add in V1.5 polish. |
| Pain note: free text or scale? | **Free text + 1-10 severity slider, optional.** | Slider's nice-to-have; V1 = free text only. |
| Should completed logs be editable by athletes? | **Yes via Reopen button** — allows correction. | OK. |
| Set-numbering on coach edits | **Preserve historical set_logs** even if prescription's `sets` count drops. | OK. |
| What happens to set_log rows when a set is added (5 → 6)? | New 6th set_log row pre-created on next `getOrCreateWorkoutLog` call. | OK. |

---

## 17. Maintenance posture

- Migration is additive; no existing-table changes.
- Sentry breadcrumbs feed any later debugging.
- All new code follows Plan 3 / 3b conventions (server-only imports, async params, Vault tokens).
- Future plans (e1RM, progress charts) consume `set_logs` data directly.

---

## 18. Next step

This spec is the input to the **superpowers:writing-plans** skill, producing the implementation plan at `docs/superpowers/plans/2026-04-28-billy-4-workout-logging.md`. Execution proceeds via **superpowers:subagent-driven-development**.
