# Plan 3.5 — Athlete Metadata Fields + Coach Profile Editor

**Date:** 2026-04-29
**Builds on:** Plans 1-6.
**Reference:** V1 design spec §6.1 athletes data model — fills the schema gap noted in Plans 3 / 3b / 4 polish backlog.

---

## 1. Goal

Migrate the missing `athletes` columns from the V1 design spec (weight class, current maxes, meet info, goal, experience level, etc.). Build a coach-side profile editor so William can fill them in. Display on athlete detail.

Unblocks downstream features:
- Plan 7 public profiles (need name/headline/bio/maxes for the donation page)
- Future meet-prep features (countdown, max-based prescribed weight calc)
- Coach-side filtering by weight class / experience level

---

## 2. Scope

### In scope
- Migration `0013_athletes_metadata.sql` — additive columns, all nullable
- Zod schema for the editor + server action
- New page `/coach/athletes/[id]/edit-profile` with a form for all fields
- Athlete detail page shows the new profile fields in a "Profile" section
- Light tests: schema unit + integration RLS for athlete updates

### Out of scope
- Athlete-side self-service profile editor → V1.5
- Onboarding wizard → after this plan
- kg/lb toggle (only display in lbs for V1) → V1.5
- Computed prescribed weight from maxes on the logger → V1.5 (this plan adds the data; V1.5 uses it)

---

## 3. New athlete columns (per V1 spec §6.1)

```sql
alter table public.athletes
  add column weight_class text,
  add column raw_or_equipped text check (raw_or_equipped is null or raw_or_equipped in ('raw','equipped')),
  add column current_squat_max numeric check (current_squat_max is null or current_squat_max >= 0),
  add column current_bench_max numeric check (current_bench_max is null or current_bench_max >= 0),
  add column current_deadlift_max numeric check (current_deadlift_max is null or current_deadlift_max >= 0),
  add column weak_points text,
  add column injury_history text,
  add column experience_level text,
  add column goal text check (goal is null or goal in ('hypertrophy','strength','meet_prep','general')),
  add column meet_date date,
  add column meet_name text,
  add column coaching_type text check (coaching_type is null or coaching_type in ('hybrid','online'));
```

`start_date` and `weight_unit_preference` already exist (Plan 2). Skip those.

All columns nullable to avoid retroactively breaking existing seeded athletes.

### Coach UPDATE policy

The existing `athletes` RLS already lets coaches UPDATE their own athletes (from Plan 2's migration). No change needed.

---

## 4. Page map

| Route | Purpose |
|---|---|
| `/coach/athletes/[id]/edit-profile` | New. Form with all the new fields. |
| `/coach/athletes/[id]` (modify) | Add a "Profile" section showing the values + "Edit profile →" link. |

---

## 5. Server action

`saveAthleteProfile(input)` — Zod-validates, derives `coachId` via `getCurrentCoach`, verifies athlete belongs to coach, updates the row.

---

## 6. Tasks

1. Migration 0013 + integration test (1-2 cases verifying the columns + check constraints)
2. Zod schema + server action
3. /coach/athletes/[id]/edit-profile page + form
4. Athlete detail page shows the Profile section
5. Final gates + push

Combine into ~2-3 subagent dispatches. No e2e in this plan (covered by integration test + manual smoke).

---

## 7. Tests

- Vitest unit: schema accepts valid + rejects invalid
- Vitest integration: coach UPDATE works, cross-coach UPDATE blocked, check constraints fire
- No new e2e (existing role-routing covers gating)
