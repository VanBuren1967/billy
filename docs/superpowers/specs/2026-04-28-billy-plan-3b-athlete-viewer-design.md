# Plan 3b — Athlete Program Viewer: Design Spec

**Date:** 2026-04-28
**Status:** Design (pending user review → implementation plan)
**Owner:** project owner (referred to as "the operator")
**Builds on:** Plan 1 (foundation + auth), Plan 2 (athlete roster + invite + request-to-join), Plan 2.5 (branded transactional emails), Plan 3 (programs subsystem — coach side, shipped 2026-04-27).
**Reference:** `docs/superpowers/specs/2026-04-25-billy-coaching-platform-design.md` (overall V1 design — §7 page map, athlete pages).

---

## 1. Goal

Close the loop on Plan 3: an athlete signs in via a magic-link invite (or magic-link login if already onboarded), lands on `/app`, sees their currently-assigned program, and can browse it week-by-week. Read-only — no logging yet. Plan 4 adds workout logging on top of this viewer.

After this plan ships, William can build a program in `/coach/programs/...`, assign it to an athlete, and the athlete sees it within seconds of signing in. The full coach-builds-and-assigns → athlete-sees-and-reviews loop becomes the user-visible MVP.

---

## 2. Scope

### In scope

- **Athlete role-gating** verified end-to-end (middleware bounces non-athlete from `/app`; athlete bounced from `/coach`). Already wired in Plan 1's `proxy.ts`; this plan verifies and extends.
- **RLS extension** so athletes can `SELECT` programs where `athlete_id = their_athletes_row_id` and the program is active. Cascades to `program_days` and `program_exercises` via the same traversal pattern.
- **`/app` page** — athlete dashboard shell. Shows: active program name, current week, this week's days, the "Today's Workout" card if today is a scheduled day, "no program assigned yet" empty state otherwise.
- **`/app/program` page** — full week-by-week program viewer. Same Vault aesthetic as the coach builder, but no inputs / no buttons / no actions. Pure read.
- **`/app` layout** with minimal nav (just "Program" for now; check-ins / progress are future plans). Uses Vault tokens.
- **Athlete `getCurrentAthlete()` helper** mirroring `getCurrentCoach()` from Plan 3.
- **Auth callback handling** so an athlete clicking a magic-link lands at `/app` (not `/coach`).
- **Tests:** vitest integration for athlete RLS reads, unit for "today's workout" calculation, Playwright e2e covering athlete sign-in → view program.

### Out of scope (deferred)

- **Workout logging** (`workout_logs`, `set_logs` tables, `/app/workout/[program_day_id]`) → Plan 4.
- **Athlete profile metadata fields** (`weight_class`, `current_squat_max`, etc.) → Plan 3.5 or Plan 4 prep — added only when actually needed. Plan 3b dashboard renders prescribed loads as `75%` without computing absolute weight from a missing max field.
- **Weekly check-ins** (`check_ins` table + `/app/check-in`) → separate plan.
- **Athlete profile editor / public profile / donations** → Plan 5+.
- **Progress / PRs / charts** (`/app/progress`) → later plan.
- **Onboarding wizard** (`/app/onboarding` from V1 spec §8.1) — currently athletes who clicked an invite land at `/app` directly. Without the missing profile fields there's nothing to onboard them through. Add when Plan 3.5 lands the schema.
- **Push notifications / SMS reminders** — V1.5+.
- **Calendar / iCal export** — V1.5+.
- **Multiple concurrent active programs per athlete** — V1 assumes one active program at a time. If multiple `is_active=true, athlete_id=X, is_template=false` exist, show the most recently created.

---

## 3. Decisions

| Decision | Value | Why |
|---|---|---|
| Plan size | Athlete-side only (the read-half mirror of Plan 3a) | Tight, shippable, closes the build-and-view loop. Workout logging is Plan 4. |
| RLS model | New SELECT policies on `programs`/`program_days`/`program_exercises` for the athlete role | Defense in depth: even with a leaked anon key an athlete cannot read another athlete's program. Same pattern as coach RLS but `athlete_id = my_athletes_row_id` instead of `coach_id = my_coaches_row_id`. |
| Athlete identity helper | New `lib/athletes/get-current-athlete.ts` | Mirrors `lib/programs/get-current-coach.ts`. Throws on unauthenticated or non-athlete. |
| "Today's workout" calculation | `today_day_number = weekday_of(today, week_starts_on=monday)` | V1 assumes athletes train on a Monday-start weekly schedule. Day 1 = Monday, Day 4 = Thursday. If today's weekday > total days in this program week, show "Rest day" or the next scheduled day. |
| Current week calculation | `current_week = floor(days_since_program_start / 7) + 1`, capped at `total_weeks` | Programs without `start_date` show "Week 1" by default until a start date is set. |
| Multiple-active-programs disambiguation | Show the most recently created `is_active=true, is_template=false, athlete_id=me` program | V1 assumes one active program; multiples are an edge case. |
| Read-only enforcement | UI-side only (no inputs, no submit handlers) + RLS does not grant INSERT/UPDATE/DELETE to athletes | Even if the UI had a hidden form, the RLS would refuse the write. |
| `/app` layout | Top nav with "Program" only for V1; "Today" / "This Week" appear as cards on `/app` itself | Minimal — more nav links arrive when check-ins / progress ship. |
| Visual design | Vault aesthetic, identical token palette to coach side | Consistent across the platform. Athlete sees the same brand. |
| Auth callback routing | After successful magic-link verify → `getUserRole()` → coach → `/coach`, athlete → `/app`, neither → `/login?error=account_not_yet_linked` | The role-discrimination already exists in `lib/auth/get-user-role.ts` (Plan 1). This plan ensures the callback consumes it correctly. |
| Mobile-first vs desktop-first for athlete view | **Mobile-first.** Athletes use phones at the gym. | Per V1 spec §3 "Mobile-first for field roles". |
| Tabular numerals on rendered loads | Yes — same CSS feature as coach builder | Consistency. |

---

## 4. Schema changes

Migration: `supabase/migrations/0010_programs_athlete_select_rls.sql`.

### 4.1 Athlete-side RLS policies

The existing programs RLS (migration 0007) grants SELECT only to the owning coach (`coach_id = auth_coach_id()`). Athletes need their own SELECT policy keyed on `athlete_id = auth_athlete_id()` (where `auth_athlete_id()` is a new helper SQL function).

```sql
-- Helper: returns the athletes.id for the current authenticated user, or null.
create or replace function public.auth_athlete_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from public.athletes where auth_user_id = auth.uid()
$$;

grant execute on function public.auth_athlete_id() to authenticated;

-- programs: athlete reads their own assigned program(s) only.
create policy programs_athlete_select on public.programs
  for select using (
    athlete_id = public.auth_athlete_id() and is_template = false
  );

-- program_days: athlete reads days belonging to their own program(s).
create policy program_days_athlete_select on public.program_days
  for select using (program_id in (
    select id from public.programs
    where athlete_id = public.auth_athlete_id() and is_template = false
  ));

-- program_exercises: athlete reads exercises belonging to their own program's days.
create policy program_exercises_athlete_select on public.program_exercises
  for select using (program_day_id in (
    select pd.id from public.program_days pd
      join public.programs p on p.id = pd.program_id
    where p.athlete_id = public.auth_athlete_id() and p.is_template = false
  ));
```

No `INSERT` / `UPDATE` / `DELETE` policies for the athlete role. The existing coach policies remain unchanged.

### 4.2 No new tables

Athlete profile metadata (`weight_class`, `current_squat_max`, etc.) is deferred. The `athletes` table stays as-is.

---

## 5. Page map

| Route | Purpose | Server actions / queries invoked |
|---|---|---|
| `/app` | Athlete dashboard. Shows the active program summary + "Today's Workout" card + this week's days. Empty state if no active program. | `getActiveProgramForAthlete()`, `computeCurrentWeekAndDay()` |
| `/app/program` | Full week-by-week read-only program viewer. Collapsible like the coach builder but no inputs. | `getActiveProgramTree()` |

Future routes (out of scope for 3b but reserved):
- `/app/onboarding` — first-time profile setup (after Plan 3.5 schema)
- `/app/workout/[program_day_id]` — Plan 4
- `/app/check-in` — separate plan
- `/app/progress` — separate plan
- `/app/settings` — separate plan

---

## 6. User flows

### 6.1 Athlete clicks invite, lands at /app

1. Coach approved an athlete via `/coach/requests` OR sent a direct invite via `/coach/athletes/new`. Both flows generated a magic-link email via Resend.
2. Athlete clicks the link → Supabase Auth verifies → `/auth/callback?code=...&next=/app`.
3. Callback exchanges code for session, calls `getUserRole(supabase)`. Role is `'athlete'`. Redirects to `/app`.
4. `/app` reads the athlete's active assigned program (or shows empty state).

### 6.2 Athlete signs in (returning user)

1. Athlete visits `/login`, types email, submits.
2. Magic link arrives. Click → `/auth/callback?code=...`.
3. Same callback logic as 6.1.

### 6.3 Athlete views their program

1. From `/app`, click "View full program" on the active program card → `/app/program`.
2. Page renders the full Week 1 → Week N tree, with current week expanded by default and others collapsed.
3. Athlete can expand any week. No edit affordances visible.

### 6.4 Athlete with no active program

1. Athlete signs in successfully but has no `programs` row with `athlete_id = me, is_active = true, is_template = false`.
2. `/app` shows: "Your coach hasn't assigned you a program yet. Check back soon."
3. `/app/program` shows: same empty state.

### 6.5 Athlete with multiple active programs (edge case)

1. Coach assigned the same template twice, both active.
2. `/app` picks the most recent (highest `created_at`) and shows it.
3. (V2 might add a program switcher; V1 assumes one.)

---

## 7. Security & RLS

### 7.1 Threat model

- **Cross-athlete data leak.** Athlete A reads/sees Athlete B's program.
- **Athlete writes program.** Athlete attempts to edit, add, remove, archive.
- **Athlete reads coach's templates.** Athlete browses templates from other coaches.
- **Athlete reads own archived programs.** Acceptable for V1 (history view); the policy currently denies because it's keyed only on `is_active=true` is NOT actually in the policy — the `is_template=false` filter is, but `is_active` is not. **Decision:** athletes CAN see their own archived programs (history value). Coach-side archive simply hides from default lists; data is still queryable.

### 7.2 Defenses

1. **Middleware** (`proxy.ts`) — already gates `/app` to authenticated users. Plan 1 routing covers `/app/*` → athletes only.
2. **Server-side `getCurrentAthlete()`** — every athlete-only data fetcher validates the role. Throws `'unauthenticated'` or `'not_an_athlete'`.
3. **Postgres RLS** — the actual security guarantee. The new SELECT policies (§4.1) restrict to the calling user's `athletes.id`. Templates excluded by `is_template = false`. No INSERT/UPDATE/DELETE policies for athletes.

### 7.3 What we explicitly do NOT trust

- Form-field `athlete_id` — never accepted from client.
- URL param `program_id` — accepted but RLS verifies it belongs to the calling athlete.

### 7.4 Athlete cannot enumerate other coaches' programs

The new RLS policies join through `athletes` row's `auth_user_id = auth.uid()`. An athlete who somehow has multiple coach assignments still only sees programs where `programs.athlete_id` equals their own athletes row id. Coaches' templates (`is_template=true`) are excluded entirely from the athlete policy.

---

## 8. Validation

No user-submitted data in Plan 3b — the athlete viewer is read-only. No Zod schemas needed for inputs. The `getCurrentAthlete()` helper validates server-side.

(Plan 4 will introduce input schemas for log entries.)

---

## 9. Observability

### 9.1 Sentry breadcrumbs

Add an `'athlete.program_view'` breadcrumb when an athlete visits `/app/program`. Useful for "who's actively engaging with their program" analytics later. One breadcrumb per page-load is fine.

### 9.2 Server logs

Standard server-component logging from Next.js + Vercel.

---

## 10. Test plan

### 10.1 Vitest unit (~3-4 tests, `tests/unit/athletes/`)

| File | Tests |
|---|---|
| `tests/unit/athletes/current-week.test.ts` | computes Week 1 on start_date · computes Week 3 on day 15 · caps at total_weeks (Week 4 of a 4-week program even on day 30) · null start_date → Week 1 |
| `tests/unit/athletes/today-day.test.ts` | Monday → Day 1 · Thursday → Day 4 · weekend with 4-day program → "Rest day" |

### 10.2 Vitest integration (~4-5 tests, `tests/integration/athletes/`)

| File | Tests |
|---|---|
| `tests/integration/athletes/program-rls.test.ts` | Athlete A cannot SELECT Athlete B's program (different coach) · Athlete A cannot SELECT Athlete B's program (same coach) · Athlete A CAN SELECT their own assigned program · Athlete A cannot SELECT any template (is_template=true) · Athlete A cannot INSERT/UPDATE/DELETE on programs |

### 10.3 Playwright e2e (~3 tests, `tests/e2e/athletes/`)

| File | Tests |
|---|---|
| `tests/e2e/athletes/sign-in-and-view.spec.ts` | Athlete signs in via magic-link, lands at /app, sees their assigned program name + this week's days |
| `tests/e2e/athletes/view-program.spec.ts` | Athlete navigates to /app/program, sees the full tree, clicking week headers expands/collapses |
| `tests/e2e/athletes/empty-state.spec.ts` | Athlete with no assigned program sees the friendly empty state on both /app and /app/program |

### 10.4 Coverage target

- All RLS policies: dedicated integration test asserting cross-athlete denial.
- Happy path: e2e covers "coach assigns → athlete views" end-to-end.

---

## 11. UX principles

Athletes are mobile-first. The viewer must:

1. **Render correctly on a 375px-wide phone screen.** Tables collapse or scroll horizontally; nothing truncates.
2. **Touch-friendly.** Tap targets are ≥44px (week-header expand button, "View full program" button).
3. **Clear current-week indication.** The "current" week is highlighted in gold; past weeks are dimmed; future weeks are normal.
4. **Today's workout card front and center on `/app`.** This is the primary action.
5. **Read-only must look read-only.** No input borders, no buttons except navigation, no edit affordances. Tables show data, not forms.
6. **Vault aesthetic intact.** Black background, gold accents, serif headings, sans body. Same tokens as coach side.
7. **Fast first paint.** Server-rendered, single DB query to fetch the program tree. No client-side data fetching needed.

---

## 12. Edge cases

| Case | Handling |
|---|---|
| Athlete has no `athletes` row (auth user exists but invite not yet processed) | `/app` shows "Your invitation hasn't fully linked. Sign out and click your invite link again." (Defensive — should not happen in normal flow.) |
| Athlete has no active program | `/app` shows "Your coach hasn't assigned you a program yet." |
| Athlete has multiple active programs | Show the most recent (highest `created_at`). Note the limitation in spec §15 known limitations. |
| Program has `start_date = null` | Show "Week 1" as default. |
| Program has past `end_date` | Show all weeks; current week is capped at `total_weeks`. Add "(Completed)" badge in the header. |
| Weekend day on a 4-day program | "Rest day — your next workout is Monday Day 1." |
| Today's day is locked (workout already logged) | N/A in 3b — no logging yet. Plan 4 handles this. |
| Coach edits a future week mid-program | Athlete sees the new structure on next page-load. RLS allows the read; the change is server-side. |
| Coach archives the active program | Athlete still sees it (decision §7.1) — archived programs remain queryable. |
| Network failure on `/app` load | Standard Next.js error boundary catches; show "Something went wrong" with a retry. |
| Group label A1/A2 superset rendering | Show the block letter + numbered position (e.g., "A1 Squat, A2 Pendlay row"). Indent or visually group. |

---

## 13. Performance

Targets:
- `/app` first paint: < 400ms with one assigned program.
- `/app/program` first paint: < 600ms with a 16-week program (~512 rows).
- All weeks collapsed by default except the current one.

Strategies:
- Server components with a single SELECT query joining `programs` + `program_days` + `program_exercises` for the active program.
- No client-side hydration overhead beyond the toggle state.

---

## 14. Out of scope (V1.5+)

(Restating §2 deferred list with destinations.)

- Workout logging → Plan 4.
- Athlete profile metadata → Plan 3.5 or Plan 4 prep.
- Onboarding wizard → after Plan 3.5.
- Weekly check-ins → separate plan.
- Donations / public profile → Plan 5.
- Progress / PRs → later plan.
- Multiple-active-program switcher → V1.5+.
- iCal export, push notifications, SMS reminders → V1.5+.

---

## 15. Open questions / defaults applied

| Question | Default | Owner to confirm |
|---|---|---|
| Should athletes see archived programs? | **Yes** — historical reference. Filter via UI toggle later. | OK to keep. |
| What weekday does "Day 1" map to? | **Monday** (week_starts_on = Monday) | William's training norm; confirm. |
| Does the dashboard show prescribed loads in absolute weight (lb) or % only? | **Both as configured** — render `75%` if no `load_lbs` is set, `185 lb` if set, never compute from a missing max. | Add max-based math in Plan 3.5 / 4. |
| Display percentages with implicit max calculation? | **No** — defer until profile metadata exists. | Confirm. |
| Should athletes see "completed" badge on past days? | **No in 3b** — no logging yet. Add in Plan 4. | OK. |
| Should the empty state link athletes back to `/login` or hide nav entirely? | **Show nav, just empty content.** | OK. |

---

## 16. Maintenance posture

- New migration is additive (only new policies + new function); existing coach behavior unchanged.
- Athlete identity helper colocated under `lib/athletes/` alongside future athlete-side code.
- New routes under `/app/*` which middleware already gates to authenticated users.
- All new code follows Plan 3 conventions (server-only imports, async params, Vault tokens).

---

## 17. Next step

This spec is the input to the **superpowers:writing-plans** skill, which produces a step-by-step implementation plan with milestone-level tasks, file-level decomposition, and a test-driven build order. The plan will live at `docs/superpowers/plans/2026-04-28-billy-3b-athlete-viewer.md`.

After the plan is written, execution proceeds via **superpowers:subagent-driven-development**.
