# Plan 3 — Programs Subsystem (Coach Side): Design Spec

**Date:** 2026-04-27
**Status:** Design (pending user review → implementation plan)
**Owner:** project owner (referred to as "the operator")
**First customer:** William Steele (single coach in V1)
**Builds on:** Plan 1 (foundation + auth), Plan 2 (athlete roster + invite + request-to-join), Plan 2.5 (branded transactional emails — shipped 2026-04-27).
**Reference:** `docs/superpowers/specs/2026-04-25-billy-coaching-platform-design.md` (overall V1 design).

---

## 1. Goal

Give William a fast, reliable, professional builder for powerlifting training programs (weeks → days → exercises) and an assignment workflow that links a program to one of his athletes. After this plan ships, William can build a 16-week meet-prep block from scratch or from a template, assign it to an athlete in two clicks, and edit any future week without breaking history.

This plan ships **only the coach side**. Athletes still cannot see their programs after this plan — that's Plan 3b. We split this way so the coach UX gets full-spec design attention without the athlete view distorting decisions.

---

## 2. Scope

### In scope

- Schema additions for grouping (`group_label` on `program_exercises`).
- `/coach/programs` library page — two tabs: Programs (assigned) and Templates.
- `/coach/programs/new` — create new program (blank, or duplicate from template, or duplicate from another assigned program).
- `/coach/programs/[id]/edit` — single-page outliner builder (week → day → exercise nesting).
- Program assignment flow: from a template card, "Assign to athlete" → pick athlete → deep-copy template → new assigned program with `is_template=false`.
- Per-athlete program list at `/coach/athletes/[id]/programs` (read-only summary; clicking a row opens the builder).
- Reordering: up/down arrow buttons on each week, day, exercise row. No drag-drop in V1.
- Program archival via `is_active=false` (no hard-delete; soft archival hides from default views).
- Optimistic-lock conflict handling via the existing `version` column on `programs`.
- Locking of `program_days` that have any associated `workout_logs` (defense for Plan 4 even though logs don't exist yet).
- Full RLS coverage: every program-related table gets read/write/delete policies tested via the Supabase test harness.
- Zod schemas for every server action.
- Sentry breadcrumbs for program-lifecycle events (created, assigned, edited, archived, deep-copied) — sets a foundation for the V1.5 audit log without committing to a full audit-table now.
- Test coverage: ~30 new tests across vitest unit + integration and Playwright e2e.

### Out of scope (deferred)

- **Athlete program viewer (`/app/program`)** → Plan 3b.
- **Workout logging** (`workout_logs`, `set_logs`) → Plan 4.
- **Drag-and-drop reordering.** Up/down arrows are V1; richer reorder UX comes when we have user feedback.
- **Bulk-edit operators** ("scale all squat loads +5%", "swap exercise X for Y across all weeks"). Common request from coaches but adds 3-4× the UI complexity. V1.5+.
- **Stock template marketplace** (5/3/1, Sheiko, Norwegian, etc.). Each coach builds their own.
- **CSV / spreadsheet import.** Possible V1.5 if William has legacy programs to migrate.
- **AI program suggestions / auto-generation.** Per the V1 spec, Doc 1's system prompt is V1.5+.
- **Athlete-level overrides** ("same template but Athlete A swaps DB press for floor press"). Today: edit the assigned copy directly. V1.5: structured overrides.
- **Mesocycle wall view** (all 16 weeks at once). V1 = current-week-detail focus; mesocycle wall is V1.5.
- **Program comments / coach-athlete in-app messaging on a specific exercise.** V1.5+ (in-app messaging is on the V1 deferred list per spec section 2).
- **Versioned change-history view.** Every edit overwrites; we capture lifecycle events to Sentry but not to a queryable version log. V1.5.
- **Cluster sets, drop sets, conditional rules.** Tier-C complexity → V1.5+ when explicitly requested by William by name.
- **Hard-delete of programs.** Programs are referenced by future logs and audit history; soft-archival is the only delete primitive.

---

## 3. Decisions

| Decision | Value | Why |
|---|---|---|
| Plan size | Coach side only (this plan = Plan 3a) | Validate builder UX with William before bundling athlete view; smaller, reviewable plans bound the typecheck/test risk we hit in Plan 2.5 pre-flight. |
| Exercise complexity tier | **Tier B + AMRAP free-text** | Covers ~95% of competitive powerlifting. Adds one nullable text column. Tier-C features deferred until William names a missing capability. |
| Builder paradigm | **Single-page outliner** (collapsible Week → Day → Exercise nesting, inline editing, no modals) | Modern coaching-app convention (TrueCoach, Heavy.io). Faster than a wizard for power users; cleaner than a spreadsheet for design polish. |
| Template strategy | **First-class.** Library has Programs + Templates tabs. Assignment deep-copies. | Coaches reuse 70-90% of program structure; bad template ergonomics kill adoption. |
| Assignment behavior | **Deep-copy** (snapshot) on assign | Editing the assigned copy never affects the template, and vice versa. Predictable mental model. |
| Reorder UX | Up/down arrow buttons | Fast to build, fast to test, accessible by keyboard. Drag-drop deferred. |
| Editing after assign | Future weeks live-update; days with logs lock | Matches V1 spec section 8.6 + edge case "completed sets locked". |
| Concurrent-edit safety | `version` column optimistic locking; conflict warning + reload prompt | Already in V1 spec data model. Last-write-wins with explicit warning. |
| Archive vs delete | **Soft-archive only.** `is_active=false`. | Logs reference programs; hard-delete corrupts history. |
| Audit trail (V1) | Sentry breadcrumbs for lifecycle events | Real audit-log table is V1.5 work; Sentry gives operator a forensic trail without scope creep. |
| Validation | Zod on every server action input + return type | End-to-end TS safety; catches malformed payloads before they hit Postgres. |
| Authorization model | Server-side `coach_id` derivation from `auth.uid()` + Postgres RLS | Defense in depth: client cannot send `coach_id`. Even if middleware misses, RLS refuses. |
| Block type display | Color-coded badges in library | `block_type` enum (`hypertrophy`/`strength`/`peak`/`general`) — quick scan in library. |
| Mobile / tablet | Builder works on tablet (≥1024px) but optimized for desktop | Coach is desktop-first per V1 spec. Phone-builder is V1.5+. |
| URL structure | `/coach/programs/*` + `/coach/athletes/[id]/programs` | Matches V1 spec page map. |
| Date handling | `start_date` / `end_date` are dates (no time). `total_weeks` derived. | Already in spec data model. |
| Internal weights | Stored in lbs; UI display per coach `weight_unit_preference` | Per spec section 3 "Internal weight unit". |

---

## 4. Schema changes

Migration: `supabase/migrations/<ts>_plan_3_program_groups_and_archive.sql`.

### 4.1 New column: `program_exercises.group_label`

```sql
ALTER TABLE program_exercises
  ADD COLUMN group_label text;
COMMENT ON COLUMN program_exercises.group_label IS
  'Optional grouping label like "A", "B" for supersets/circuits. Null = standalone. Exercises in the same program_day with the same group_label form a block (A1/A2/A3...) ordered by position.';
```

No constraint enforcing single-letter — keep it flexible (a coach might use "Block 1"). Validation in Zod.

### 4.2 Soft-archival columns

`programs.is_active` already exists per V1 spec data model. Verify it does in the live schema; add if missing.

`program_days.is_active` and `program_exercises.is_active` — **not added in V1.** Coach can fully edit these via the builder. Hard-delete is allowed except when blocked by referenced logs (which can't exist until Plan 4 ships, but the FK will be there for forward safety).

### 4.3 RLS implications of new column

`group_label` doesn't need its own policy — it inherits the existing per-coach RLS on `program_exercises` (which traverses `program_day_id → program_id → coach_id`). Section 7.2 has the policy SQL.

### 4.4 FK forward-compat for Plan 4

Plan 4 will introduce `set_logs.program_exercise_id`. To make removal-after-logging safe, this plan defines the FK with `ON DELETE RESTRICT` once it lands. In V1 (no logs yet), exercise removal is a hard-delete; once Plan 4 ships, attempting to delete an exercise with logs will surface a friendly error.

### 4.5 No new tables

No new tables in this plan. Audit log is deferred (Sentry breadcrumbs only). Bulk-edit operators are deferred.

---

## 5. Page map

| Route | Purpose | Server actions invoked |
|---|---|---|
| `/coach/programs` | Library. Two tabs: **Programs** (assigned, default) and **Templates**. Each shows a card grid. Sort: most recently edited. Filter by block type. Empty state with "Create your first program". | `listPrograms({tab})` |
| `/coach/programs/new` | Three-mode landing: **Start blank** · **Duplicate template** · **Duplicate existing program**. Choosing a duplicate shows a one-step picker; choosing blank goes straight to builder. | `createProgram({mode, sourceProgramId?, athleteId?})` |
| `/coach/programs/[id]/edit` | Single-page outliner builder. Auto-save on every field blur. | `saveProgramHeader`, `saveProgramDay`, `saveProgramExercise`, `addProgramDay`, `addProgramExercise`, `removeProgramDay`, `removeProgramExercise`, `reorderProgramDay`, `reorderProgramExercise` |
| `/coach/programs/[id]/assign` | Modal-or-page that picks an athlete + start date, deep-copies the program, and redirects to the new copy's editor. Only reachable from a template card. | `assignProgramToAthlete({templateProgramId, athleteId, startDate})` |
| `/coach/programs/[id]/archive` | Server action only (no page). Triggered from the program card menu. Soft-archives. | `archiveProgram({id})` |
| `/coach/athletes/[id]/programs` | Per-athlete program list (assigned + archived toggle). Read-only summary; clicking a row opens the builder for that program. | (re-uses `listPrograms` filtered by `athlete_id`) |

All routes role-gated (`coach` only) by middleware. RLS is the second layer.

---

## 6. User flows

### 6.1 Build from blank

1. William → `/coach/programs` → **New program** → "Start blank".
2. Lands on `/coach/programs/new` with form: name, block_type, total_weeks, optional notes, "Save as template?" checkbox.
3. Submit → `createProgram({mode: "blank", isTemplate, totalWeeks, ...})` creates `programs` row + N `program_days` (`week_number=1..N, day_number=1, name="Day 1"` as scaffolding) → redirects to `/coach/programs/[id]/edit`.
4. Builder is empty; William adds days, exercises, configures.

### 6.2 Build from template

1. William → `/coach/programs` → Templates tab → click a template card → menu → "Use as starting point".
2. `createProgram({mode: "duplicate_template", sourceProgramId})` deep-copies the template's days + exercises into a fresh `programs` row with `is_template=false, athlete_id=null` (still unassigned).
3. Redirect to the new program's `/edit` page. William can then explicitly assign it via "Assign to athlete" button.

### 6.3 Assign template to athlete (combined flow)

1. From `/coach/programs` Templates tab → template card → "Assign to athlete".
2. `/coach/programs/[id]/assign` page or modal: picks athlete from dropdown (William's roster) + start date.
3. Submit → `assignProgramToAthlete({templateProgramId, athleteId, startDate})`:
   - Deep-copies template's `program_days` and `program_exercises` (with `group_label`s preserved) into a new program with `is_template=false, athlete_id=X, start_date=Y, end_date=Y + (total_weeks * 7) days`.
   - Sentry breadcrumb: `program_assigned`.
   - Returns the new program's id.
4. Redirect to `/coach/programs/[new-id]/edit` so William can do per-athlete tweaks before the athlete sees it.

### 6.4 Edit assigned program

1. William → `/coach/athletes/[id]/programs` → click the active program → `/coach/programs/[id]/edit`.
2. Builder shows nested tree with collapse-by-default at the week level.
3. Click a day to expand; inline-edit any field (auto-saves on blur via `saveProgramExercise` etc.).
4. Add exercise → row appears, focused on name input.
5. Reorder via ▲▼ arrows → `reorderProgramExercise` updates `position`.
6. Remove → hard-delete in V1 (no `set_logs` exist yet; FK from `set_logs.program_exercise_id` will be `ON DELETE RESTRICT` so once Plan 4 ships and logs exist, the delete is auto-blocked).
7. Locked indication: completed days (none in V1, but UI is ready) show a lock icon and read-only mode.

### 6.5 Concurrent edit conflict

1. William has the builder open in two tabs.
2. He saves an exercise change in tab A → `version` bumps from N to N+1.
3. He saves a different change in tab B (still has version N) → server returns conflict error.
4. UI shows: "This program was edited elsewhere. Reload to see the latest version." Single button: "Reload". No silent overwrite.

### 6.6 Archive program

1. From `/coach/programs` card menu → "Archive".
2. Confirmation dialog: "Archived programs are hidden from the default list. Athlete will no longer see this program. Workout history is preserved."
3. Confirm → `archiveProgram({id})` sets `is_active=false`. Sentry breadcrumb: `program_archived`.
4. Card disappears from default list. Toggle "Show archived" reveals it; "Restore" un-archives.

---

## 7. Security & RLS

### 7.1 Threat model

- **Cross-tenant data leak.** Coach A reads/writes Coach B's programs.
- **Privilege escalation.** Athlete posts a program update.
- **Server-action input tampering.** Client modifies a `coach_id` or `program_id` to point at someone else's data.
- **Concurrent-edit data loss.** Two tabs overwrite each other silently.

### 7.2 Defenses (defense in depth)

1. **Middleware** (`proxy.ts`) bounces non-coach roles from `/coach/*` to `/app` or `/login`. Existing in Plan 1; no change.

2. **Server actions** derive `coach_id` from `auth.uid()` server-side. The client never sends `coach_id`. Every action starts with:
   ```ts
   const { data: { user } } = await supabase.auth.getUser();
   if (!user) throw new Error('unauthenticated');
   const coach = await getCoachByAuthUserId(user.id);
   if (!coach) throw new Error('not_a_coach');
   ```
   Then every query is filtered by `coach.id`.

3. **Postgres RLS** (the actual security guarantee). Policies for each program-related table:

   ```sql
   -- programs: coach reads/writes own only.
   CREATE POLICY programs_coach_select ON programs
     FOR SELECT USING (coach_id = (
       SELECT id FROM coaches WHERE auth_user_id = auth.uid()
     ));

   CREATE POLICY programs_coach_insert ON programs
     FOR INSERT WITH CHECK (coach_id = (
       SELECT id FROM coaches WHERE auth_user_id = auth.uid()
     ));

   CREATE POLICY programs_coach_update ON programs
     FOR UPDATE USING (coach_id = (
       SELECT id FROM coaches WHERE auth_user_id = auth.uid()
     ));

   -- (no DELETE policy — soft-archive only via UPDATE.)
   ```

   `program_days` and `program_exercises` policies traverse to `programs.coach_id`:

   ```sql
   CREATE POLICY program_days_coach_select ON program_days
     FOR SELECT USING (program_id IN (
       SELECT id FROM programs WHERE coach_id = (
         SELECT id FROM coaches WHERE auth_user_id = auth.uid()
       )
     ));
   -- same shape for INSERT/UPDATE.

   CREATE POLICY program_exercises_coach_select ON program_exercises
     FOR SELECT USING (program_day_id IN (
       SELECT id FROM program_days WHERE program_id IN (
         SELECT id FROM programs WHERE coach_id = (
           SELECT id FROM coaches WHERE auth_user_id = auth.uid()
         )
       )
     ));
   -- same shape for INSERT/UPDATE.
   ```

   The traversal is verbose but transparent and testable. Helper SQL function `auth_coach_id() RETURNS uuid` collapses repetition:
   ```sql
   CREATE FUNCTION auth_coach_id() RETURNS uuid LANGUAGE sql STABLE AS $$
     SELECT id FROM coaches WHERE auth_user_id = auth.uid()
   $$;
   ```
   All policies use `coach_id = auth_coach_id()` then.

4. **Optimistic locking** (`version` column). Every UPDATE on `programs` increments `version`. Server actions accept the client's expected `version` and return `409` if mismatch.

### 7.3 What we explicitly do NOT trust

- Form-field `coach_id` — discard, derive server-side.
- Form-field `program_id` — accept, but RLS verifies it belongs to the coach.
- Optimistic-lock `version` — accept and verify.
- Free-text fields (notes, name, exercise name) — sanitize for XSS at render (React does this by default; never use `dangerouslySetInnerHTML` here).

---

## 8. Validation (Zod)

Per server action. Examples:

```ts
// lib/programs/schemas.ts
import { z } from 'zod';

export const blockTypeSchema = z.enum(['hypertrophy', 'strength', 'peak', 'general']);

export const createProgramSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('blank'),
    name: z.string().min(1).max(120),
    blockType: blockTypeSchema,
    totalWeeks: z.number().int().min(1).max(52),
    notes: z.string().max(2000).optional().nullable(),
    isTemplate: z.boolean().default(false),
    athleteId: z.string().uuid().optional().nullable(),
    startDate: z.string().date().optional().nullable(),
  }),
  z.object({
    mode: z.literal('duplicate_template'),
    sourceProgramId: z.string().uuid(),
  }),
  z.object({
    mode: z.literal('duplicate_program'),
    sourceProgramId: z.string().uuid(),
  }),
]);

export const saveProgramExerciseSchema = z.object({
  programExerciseId: z.string().uuid(),
  programVersion: z.number().int().min(1),
  name: z.string().min(1).max(120),
  sets: z.number().int().min(1).max(50),
  reps: z.string().min(1).max(40), // free text: "5", "5,3,1", "AMRAP", "3+1+1"
  loadPct: z.number().min(0).max(150).optional().nullable(),
  loadLbs: z.number().min(0).max(2500).optional().nullable(),
  rpe: z.number().min(0).max(10).optional().nullable(),
  groupLabel: z.string().min(1).max(20).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});
```

Every server action: `parse → authorize → mutate → return typed result`.

---

## 9. Observability

### 9.1 Sentry breadcrumbs (program lifecycle)

Add breadcrumbs from server actions for these events:

- `program.created` — `{program_id, mode: blank|duplicate_template|duplicate_program, is_template, athlete_id?}`
- `program.assigned` — `{template_id, new_program_id, athlete_id}`
- `program.edited` — `{program_id, action: header|day|exercise|reorder, target_id?}` (one breadcrumb per save; rate-limit if needed)
- `program.archived` — `{program_id, athlete_id?}`
- `program.restored` — `{program_id}`
- `program.version_conflict` — `{program_id, expected_version, actual_version}` — captured as an explicit Sentry message (not just breadcrumb) so we can monitor frequency.

These breadcrumbs feed into any subsequent error report. Operator can see, via Sentry, the trail of operations leading to any bug.

### 9.2 Structured server logs

Every server action: `console.info` (or `pino` if we add it later) with `{action, coach_id, target_id, duration_ms, result: ok|conflict|error}`. Vercel collects these.

### 9.3 No client-side analytics in V1

Vercel Analytics already covers route-level traffic per V1 spec. No additional client-side instrumentation in this plan.

---

## 10. Test plan

### 10.1 Vitest unit (~12 tests, `tests/unit/`)

| File | Tests |
|---|---|
| `tests/unit/programs/schemas.test.ts` | createProgramSchema rejects bad payloads · saveProgramExerciseSchema accepts AMRAP rep text · groupLabel max length · totalWeeks bounds · loadPct vs loadLbs interplay |
| `tests/unit/programs/deep-copy.test.ts` | Template deep-copy preserves day order · preserves exercise order · preserves group_labels · resets athlete_id, is_template · regenerates UUIDs |
| `tests/unit/programs/end-date.test.ts` | end_date derives from start_date + total_weeks * 7 days · null start_date → null end_date |

### 10.2 Vitest integration (~10 tests, `tests/integration/`)

| File | Tests |
|---|---|
| `tests/integration/programs/rls.test.ts` | Coach A cannot SELECT Coach B's programs · Coach A cannot UPDATE Coach B's program_exercises · Athlete user-role cannot SELECT any program (Plan 3a; Plan 3b will relax for own-program reads) · Coach A cannot INSERT program with `coach_id = Coach B` (RLS WITH CHECK) |
| `tests/integration/programs/version-conflict.test.ts` | Two concurrent UPDATEs → second returns conflict · UI prompted with reload · third UPDATE with fresh version succeeds |
| `tests/integration/programs/assign.test.ts` | Assigning template deep-copies into new program with athlete_id set · Editing the assigned copy doesn't mutate the template · Re-assigning the same template creates a second independent copy |
| `tests/integration/programs/archive.test.ts` | Archived program hidden from default list · Restore re-enables · Athlete cannot see archived program |

### 10.3 Playwright e2e (~6-8 tests, `tests/e2e/`)

| File | Tests |
|---|---|
| `tests/e2e/programs/builder-blank.spec.ts` | Create blank program → enters builder → adds week → adds day → adds exercise → autosave on blur → reload preserves state |
| `tests/e2e/programs/builder-from-template.spec.ts` | Templates tab → "Use as starting point" → builder shows template structure copied |
| `tests/e2e/programs/assign-template.spec.ts` | Templates tab → "Assign to athlete" → pick athlete → submit → redirected to new editor → exercises present |
| `tests/e2e/programs/edit-after-assign.spec.ts` | Assign → edit name in assigned copy → template unchanged · Edit name in template → assigned copy unchanged |
| `tests/e2e/programs/concurrent-edit.spec.ts` | Two tabs open → save in tab A → save in tab B → tab B sees conflict warning → reload → save succeeds |
| `tests/e2e/programs/archive.spec.ts` | Archive → disappears from default list → toggle "Show archived" → reappears with badge → restore → reappears in default |

### 10.4 RLS test harness

Reuse `tests/integration/rls-policies.test.ts` pattern from Plan 1 for the new policies.

### 10.5 Coverage target

- All new server actions: 100% line coverage in unit + integration.
- All new server actions: at least one e2e exercising the happy path.
- All new RLS policies: dedicated integration test asserting cross-coach denial.

---

## 11. UX principles (for the builder)

These are the design commitments the implementation plan must honor. Each is testable against a screenshot or quick interaction trial.

1. **No modals for routine work.** Adding/editing/removing exercises happens inline in the outliner. Modals only for destructive or one-time actions: archive confirm, assign-to-athlete picker, conflict reload prompt.
2. **Auto-save on blur, not on click.** Every field saves on blur with a subtle `Saved` indicator. No "Save changes" button on the builder header.
3. **Optimistic UI.** Every save updates UI immediately, then reconciles with server response. Failure rolls back with a clear error toast.
4. **Keyboard-first reorder.** ▲▼ buttons are visible on hover and reachable by tab. `Cmd/Ctrl + ↑/↓` moves the focused row.
5. **Empty states are designed, not blank.** Empty week → "No days yet. Add Day 1." Empty day → "No exercises yet. Click + to add." Empty library → "Build your first program" with explanatory copy.
6. **Consistent tabular numerals** for set/rep/load/RPE columns (Tabular Figures CSS feature). Columns align across all rows even with different digit counts.
7. **Vault aesthetic.** Black `#080808` background, gold `#c9a14c` accents, warm bone `#f4f0e8` text, editorial serif for headlines, sans for body. Same tokens used in existing pages.
8. **Locked-day indicator.** Days with logged sets (V1: none yet; V1 forward-compat) show a small lock icon in the day header and the day's content is read-only with a different background tint.
9. **Block-type color cues.** Hypertrophy/strength/peak/general get distinct accent colors (subtle — gold variants, not rainbow).
10. **No flashing.** Loading states use shimmer, not skeleton-blink. Transitions are 300-500ms eased.

---

## 12. Edge cases

| Case | Handling |
|---|---|
| Coach builds a 16-week program with 4 days × 8 exercises (512 rows) | Builder paginates by week (collapsed by default). Server actions are per-row, so payload is small. Initial page load fetches all rows but renders only expanded weeks. |
| Coach adds exercise with all-empty fields | Zod requires `name` and `sets` and `reps` minimum. Inline error on submit. |
| Coach types `5,3,1` in reps field | Accepted. Validation only enforces non-empty + max length. Athlete-side rendering (Plan 3b) handles parsing. |
| Coach types `AMRAP @ RPE 9` in reps field | Accepted. Validation: max 40 chars. Athlete-side display passes through. |
| Coach types nothing in reps field | Inline error: "Reps required (e.g., 5, 5/3/1, AMRAP)". |
| Coach removes an exercise that is part of an A1/A2 superset | The remaining exercise stays with its `group_label`. UI shows a small notice: "A1 is now alone — block has only one exercise." (Functional but odd; coach can rename group_label or remove it.) |
| Two exercises in same day share `group_label='A'` and same `position` | `position` enforces ordering. UI uses `(group_label, position)` as the sort key. Tie-broken by `created_at`. |
| Coach assigns a template, then deletes the template | Deep-copy is independent; assigned copy survives. (Templates can be archived but not hard-deleted.) |
| Coach assigns the same template to the same athlete twice | Allowed. Two independent copies. UI shows both in the per-athlete list. |
| Athlete `auth_user_id` is null (invite not yet accepted) | Allowed assignment. Athlete sees the program once they accept invite (Plan 3b). |
| Coach archives a program that has logs (Plan 4 forward-compat) | Soft-archive succeeds. Logs remain queryable. Athlete view (3b) hides archived programs. |
| Network failure mid-save | Optimistic UI shows the unsaved change; toast: "Save failed — retrying". Background retries 3x with exponential backoff. After 3 fails, manual retry button. |
| Coach loses focus mid-edit (clicks away to another tab) | onBlur saves. Even if unfocus is to another exercise row, save fires. |
| Coach has stale data (didn't refresh after another tab edited) | Version conflict on save → friendly reload prompt. |
| Coach searches/filters library | V1: simple substring match on `name`. Block-type filter + active/archived toggle. No advanced search. |

---

## 13. Performance

### 13.1 Targets

- `/coach/programs` library: < 500ms first paint with ≤ 50 programs.
- `/coach/programs/[id]/edit` initial load: < 800ms with a 16-week program (~512 rows).
- Auto-save round-trip: < 300ms p50, < 800ms p95.
- Builder responsive at 60fps on a 16-week program with all weeks expanded.

### 13.2 Strategies

- **Server components by default** — initial render is server-rendered Postgres queries.
- **Streaming Suspense** for the per-week section if the program is large (>10 weeks).
- **Per-row server actions** — saves don't reload the whole tree; just the row's local state reconciles.
- **Postgres indexes** on `programs.coach_id`, `program_days.program_id`, `program_exercises.program_day_id` (probably already there from Plan 1; verify in migration).
- **No unnecessary client state** — the URL and the server are the source of truth. Use React's `useOptimistic` for save-in-flight states.

---

## 14. Out of scope (V1.5+)

(Restating section 2's deferred list with V1.5+ destination labels.)

- Athlete program viewer → **Plan 3b** (next plan after 3).
- Workout logging → **Plan 4**.
- Drag-drop reorder → V1.5.
- Bulk-edit operators → V1.5.
- Stock template marketplace → V1.5.
- CSV import → V1.5.
- AI suggestions → V1.5+.
- Athlete-level overrides → V1.5.
- Mesocycle wall view → V1.5.
- In-app messaging on exercises → V2 (per V1 spec).
- Versioned change-history view → V1.5.
- Tier-C complexity (cluster/drop/conditional) → V1.5+.
- Real audit-log table → V1.5 (Sentry breadcrumbs cover V1).

---

## 15. Open questions / defaults applied

| Question | Default applied | Owner to confirm |
|---|---|---|
| Should removed exercises soft-disable or hard-delete? | **Hard-delete (V1)** with FK protection forward-compat for Plan 4. Plan 4 will revisit. | Operator OK with this; revisit if Plan 4 needs different. |
| Should `group_label` autocomplete known groups in the same day? | **No autocomplete in V1.** Free text. | Add autocomplete in V1.1 if William finds typing tedious. |
| Should we validate the rep field syntax (parse `5,3,1` etc.) at coach entry? | **No — accept any short text.** Athlete logger (Plan 4) will parse for autofill. | Revisit if we see garbage data in production. |
| Should the builder show a real-time progress bar of the program (e.g., week 3 of 16, 19% complete)? | **No in V1** — Plan 3b adds this on the athlete dashboard. Coach's view is structural, not progress. | OK. |
| Should archived programs still appear in `/coach/athletes/[id]/programs`? | **Yes, with a badge.** Hidden by default behind "Show archived" toggle. | OK. |
| Should the assign flow set `start_date` to "next Monday" by default? | **Yes** — friendlier than today's date. Coach overrides if needed. | OK. |
| Should two coaches eventually share a template? | **No in V1** (single coach). V2 marketplace handles this. | OK. |

---

## 16. Maintenance posture

After this plan ships:
- New schema columns are idempotent (`ADD COLUMN IF NOT EXISTS` style) so re-running the migration is safe.
- Sentry has lifecycle breadcrumbs ready for any post-ship debugging.
- All server actions are typed end-to-end; future refactors caught by `pnpm typecheck`.
- RLS policies live in version-controlled SQL migrations.
- New routes are under `/coach/*` which the middleware already gates.

---

## 17. Next step

This spec is the input to the **superpowers:writing-plans** skill, which produces a step-by-step implementation plan with milestone-level tasks, file-level decomposition, and a test-driven build order. The plan will live at `docs/superpowers/plans/2026-04-27-billy-3-programs-coach.md`.

After the plan is written, execution proceeds via **superpowers:executing-plans** (or **subagent-driven-development**) with checkpoint-style commits per the operator's standing rule.
