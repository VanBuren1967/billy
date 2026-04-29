# Plan 5 — Weekly Check-ins: Design Spec

**Date:** 2026-04-29
**Status:** Design (pending user review → implementation plan)
**Builds on:** Plan 1, Plan 2, Plan 2.5, Plan 3, Plan 3b, Plan 4 (workout logging — shipped 2026-04-28).
**Reference:** `docs/superpowers/specs/2026-04-25-billy-coaching-platform-design.md` §6.4 check_ins schema, §8.5 weekly check-in flow.

---

## 1. Goal

Athletes submit a quick weekly check-in: bodyweight, fatigue/soreness/confidence/motivation (1-10), optional pain notes, optional meet-readiness, optional general comments. Coach sees recent check-ins on the athlete detail page. Symmetric to workout logging (Plan 4) — athlete data entry surface + coach read view. Closes the second main athlete-side data-entry loop and gives Plan 6 (coach dashboard alerts) a "low readiness" signal to flag on.

---

## 2. Scope

### In scope

- **Schema:** `check_ins` table per V1 §6.4 with `(athlete_id, week_starting)` UNIQUE.
- **RLS:** athletes CRUD own; coaches SELECT for their own athletes.
- **`/app/check-in` page:** athlete fills out the current week's check-in (or sees the existing one for review/edit).
- **`/app` dashboard:** add a "Check-in" card if this week's hasn't been submitted, or "✓ Checked in" if it has.
- **`/app/check-in` history:** below the form, show last 6 weeks of submitted check-ins (read-only summary cards).
- **Coach side:** athlete detail page (`/coach/athletes/[id]`) gets a "Recent check-ins" section showing the last 6 entries with summary metrics + pain/comments excerpts.
- **Tests:** vitest integration for RLS + uniqueness, unit for week-starting calculation, Playwright e2e for athlete-fills-and-coach-sees.

### Out of scope (deferred)

- **Sunday 8am scheduled reminder email** (Vercel Cron + Resend) — separate plan.
- **"Low readiness" alert on coach dashboard** — Plan 6 (uses check-ins data).
- **Meet readiness "show only when meet ≤6 weeks out"** — the field is always optional in V1; smart conditional needs `athletes.meet_date` (Plan 3.5).
- **Editing past check-ins** — V1: only the current week is editable; past weeks are locked once submitted. Athletes correct via "Reopen" button (same UX as workout logger).
- **Multi-athlete trends / charts on the coach side** — Plan 7+ (analytics).
- **Notifications when low-readiness check-in submitted** — V1.5+.
- **Scale-aware integration (Withings, Apple Health)** — V2+.
- **Photos / progress pics** — V2+.

---

## 3. Decisions

| Decision | Value | Why |
|---|---|---|
| Week anchor | **Monday** as `week_starting` | Matches Plan 3b's `computeTodayDay` (Monday=1). Athletes train on a Monday-start weekly schedule per V1 design. |
| One check-in per athlete-week | UNIQUE constraint on `(athlete_id, week_starting)` | Per V1 spec. Predictable. |
| Required fields | `bodyweight_lbs`, all four 1-10 sliders (`fatigue`, `soreness`, `confidence`, `motivation`) | Core signal. Without them the check-in adds no value. |
| Optional fields | `pain_notes`, `meet_readiness` (1-10), `comments` | Pain notes are intentionally low-friction (most weeks: blank). Meet readiness is conditionally relevant (V1: always shows, athlete enters when relevant). |
| 1-10 inputs | Native `<input type="range">` slider for each (with the current value displayed) | Mobile-friendly, faster than typing. Range inputs render natively well; no custom slider library. |
| Bodyweight unit | `lbs` storage + display | Per Plan 3 / 3b unit decision. kg toggle is V1.5. |
| Status states | `submitted` (implicit — row exists) / `not_submitted` (no row for this week) | No formal status enum. Existence of row = submitted. |
| Edit / reopen | Athlete can edit the current week's check-in until next Monday rolls over. Past weeks are locked. | Soft lock by week boundary. Simpler than "Reopen" workflow. |
| Submitted-at timestamp | Auto-stamped on first INSERT, not updated on subsequent edits within the same week | Tracks initial submission time for analytics later. |
| Coach side | Inline section on `/coach/athletes/[id]` (matches Plan 4's "Recent workouts" pattern) | Consistency. |
| Visibility of athlete's own data | Last 6 weeks of check-ins on `/app/check-in` below the current-week form | Athletes get historical reference for pacing. |

---

## 4. Schema changes

Migration: `supabase/migrations/0012_check_ins.sql`.

### 4.1 `check_ins` table

```sql
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
```

### 4.2 RLS

```sql
alter table public.check_ins enable row level security;

-- Athlete: full CRUD on own check-ins.
create policy check_ins_athlete_select on public.check_ins
  for select using (athlete_id = public.auth_athlete_id());
create policy check_ins_athlete_insert on public.check_ins
  for insert with check (athlete_id = public.auth_athlete_id());
create policy check_ins_athlete_update on public.check_ins
  for update using (athlete_id = public.auth_athlete_id())
  with check (athlete_id = public.auth_athlete_id());
create policy check_ins_athlete_delete on public.check_ins
  for delete using (athlete_id = public.auth_athlete_id());

-- Coach: SELECT-only for own athletes' check-ins.
create policy check_ins_coach_select on public.check_ins
  for select using (athlete_id in (
    select id from public.athletes where coach_id = public.auth_coach_id()
  ));
```

---

## 5. Page map

| Route | Purpose |
|---|---|
| `/app/check-in` | Athlete fills out this week's check-in (or sees + edits existing). Past 6 weeks shown below in read-only cards. |
| `/app` (modify) | Add a "Check-in" card showing "Submit this week's check-in →" or "✓ Checked in" badge. |
| `/coach/athletes/[id]` (modify) | Add "Recent check-ins" section (last 6 entries with metrics + notes excerpts). |

---

## 6. User flows

### 6.1 Athlete submits this week's check-in

1. Athlete on `/app` taps the Check-in card → routes to `/app/check-in`.
2. Server checks for existing check-in for (athlete_id, this Monday). If none, renders an empty form. If one exists, pre-fills.
3. Athlete enters bodyweight + adjusts 4 sliders + optional pain/meet/comments → taps Save.
4. Server upserts (insert if new, update if existing-this-week).
5. Lands back on `/app` showing "✓ Checked in" on the Check-in card.

### 6.2 Athlete reviews past check-ins

1. On `/app/check-in`, scroll past the form to see last 6 weeks of entries (oldest at bottom).
2. Each entry shows: week_starting date + bodyweight + the 4 metrics in a tight row + any pain notes/comments excerpt.

### 6.3 Coach reviews athlete's check-ins

1. Coach on `/coach/athletes/[id]` → scrolls to "Recent check-ins" section.
2. Sees last 6 entries with metrics. Pain notes highlighted in rose if present.

### 6.4 No check-in submitted yet this week

1. `/app` Check-in card: "Submit this week's check-in →" gold-bordered button.
2. `/app/check-in`: empty form, today's Monday shown as `week_starting` (server-computed).

### 6.5 Past week's check-in is locked

1. /app/check-in always shows the CURRENT week's editable form. Last week's check-in (if any) appears in the history list below as read-only.

---

## 7. Security & RLS

Threat model: same shape as Plan 4 — athlete A reading B's data, coach reading other coach's athletes, athlete tampering inputs.

Defenses:
- Middleware (`proxy.ts`) gates `/app/*` to authenticated users.
- `getCurrentAthlete()` server-side validates role on every server action.
- RLS enforces isolation at the DB layer.
- Zod validation on the saveCheckIn input.
- `week_starting` is server-computed, never accepted from client (prevents an athlete from back-filling/overwriting historical weeks).

---

## 8. Server actions

| Function | Purpose |
|---|---|
| `getCurrentWeekCheckIn()` | Returns `{ checkIn: ... | null, weekStarting: 'YYYY-MM-DD' }` for the current Monday. |
| `saveCheckIn(input)` | Upsert. Server-derives athleteId + weekStarting; client only sends the editable fields. |
| `listRecentCheckIns(athleteId, limit=6)` | Coach-side query. Returns recent entries. |
| `listOwnRecentCheckIns(limit=6)` | Athlete-side history below the form. |

---

## 9. Validation

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
```

Note: `bodyweightLbs` lower bound 50 catches obviously-wrong inputs without rejecting realistic weight classes (junior 50-kg ≈ 110 lb). Upper 700 lb covers super-heavyweights.

---

## 10. Observability

Sentry breadcrumbs:
- `checkin.submitted` — first INSERT (athlete_id, week_starting)
- `checkin.updated` — UPDATE within the same week

---

## 11. Test plan

### 11.1 Vitest unit (~3 tests)

| File | Tests |
|---|---|
| `tests/unit/check-ins/week-starting.test.ts` | Monday → that Monday · Tuesday → previous Monday · Sunday → previous Monday · matches `computeTodayDay` semantics |
| `tests/unit/check-ins/schemas.test.ts` | accepts valid input · rejects bodyweight out of range · rejects fatigue=11 · accepts optional pain notes |

### 11.2 Vitest integration (~5 tests)

| File | Tests |
|---|---|
| `tests/integration/check-ins/rls.test.ts` | Athlete A SELECTs own · Athlete B cannot SELECT A's · Coach A SELECTs own athletes' · Coach B cannot · Athlete cannot UPDATE another athlete's · UNIQUE prevents two for same week |

### 11.3 Playwright e2e (~2 tests)

| File | Tests |
|---|---|
| `tests/e2e/check-ins/submit-and-coach-sees.spec.ts` | Athlete signs in, fills check-in, saves, sees ✓ on /app · coach signs in, sees the entry on athlete detail |
| `tests/e2e/check-ins/edit-current-week.spec.ts` | Athlete submits, returns to /app/check-in, fields are pre-filled, can edit + re-save |

---

## 12. UX principles

Mobile-first like Plan 4's logger.

1. **Sliders for 1-10 fields** with current value displayed prominently (large gold number above the slider).
2. **Single bodyweight input** at the top — `inputmode="decimal"` for the right keypad on mobile.
3. **Save button** at the bottom, full-width, gold-bordered.
4. **Save-state indicator** matches Plan 4's logger pattern (small "Saved" text after successful save).
5. **Past 6 weeks** in compact horizontal cards below the form — easy to scan trends.
6. **Vault aesthetic** preserved.

---

## 13. Edge cases

| Case | Handling |
|---|---|
| Athlete submits, then tries to submit again same week | Upsert: second submit updates the existing row. submitted_at unchanged; updated_at bumps. |
| Athlete spans midnight Sun→Mon while filling | Form's `week_starting` was computed at page-load (Sunday). On save, server recomputes. If new Monday: server creates a new row for the new Monday's week. Edge case, acceptable. |
| Bodyweight as kg by mistake | Out-of-range Zod validation catches < 50 lb (≈ 23 kg). Athletes typing 70 (kg, ≈ 154 lb) actually pass through as 70 lb — but that's also "out of range" for any realistic adult. We accept this as user error; kg/lb toggle in V1.5 fixes it. |
| Coach's athlete deleted while reviewing | RLS prevents seeing the row anyway; the section just shows "no check-ins yet". |
| Network failure on save | UI shows error toast; user can retry. |
| Two browser tabs with the same form | Last-write-wins, no optimistic locking. Rare. |

---

## 14. Performance

- `/app/check-in` first paint: < 300ms (single SELECT for current week + 6 history rows).
- saveCheckIn round-trip: < 250ms p50.

---

## 15. Out of scope (V1.5+)

- Sunday 8am email reminder (Vercel Cron) — separate plan
- Low-readiness coach dashboard alert — Plan 6
- Meet-readiness conditional render — Plan 3.5 (athlete metadata fields)
- Wearable integration — V2+
- Progress photos — V2+

---

## 16. Open questions / defaults applied

| Question | Default | Owner |
|---|---|---|
| Should bodyweight be locked from edit after first submission? | **No** — athletes should be able to correct mistakes within the week. | OK. |
| Should past weeks be visible to athletes or only coaches? | **Both visible** to the athlete (last 6) for self-pacing. | OK. |
| Should we record pain LOCATION (knee, shoulder, etc.) as structured data? | **No in V1** — free text. Structured pain locations is a V1.5 add. | OK. |
| Should the check-in card on /app turn green / show celebration on submit? | **No** — minimal "✓ Checked in" gold tag only. | OK. |
| What happens if today is Monday at 12:01am and the athlete checked in last week (Sunday)? | The form is empty (it's a new week). Last week's row is in the history below. | Correct. |

---

## 17. Maintenance posture

- Migration is additive (only new table); no existing-table changes.
- Reuses existing `auth_athlete_id()` and `auth_coach_id()` helpers from earlier RLS migrations.
- Reuses Plan 4 patterns (Sentry breadcrumbs, server-derived ownership, masked DB errors).

---

## 18. Next step

This spec is the input to the **superpowers:writing-plans** skill.
