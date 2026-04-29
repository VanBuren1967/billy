# Plan 6 — Coach Dashboard Alerts: Design Spec

**Date:** 2026-04-29
**Builds on:** Plans 1-5. Reuses workout_logs (Plan 4) and check_ins (Plan 5) data.
**Reference:** V1 design spec §8.7 "Coach reviews & adjusts" — alerts for missed workouts, pain, low readiness, recent activity.

---

## 1. Goal

Surface the most useful at-a-glance signals on `/coach` so William can scan his roster in seconds. Replaces the "Coming soon" stub. Alert categories per V1 spec §8.7:

- **Missed workouts** — assigned athletes whose last workout_log is >7 days old
- **Pain reports** — last 14 days of pain notes (workout-level or check-in-level)
- **Low readiness** — last 14 days of check-ins flagging fatigue ≥8, soreness ≥8, or motivation ≤3
- **Recent activity** — last 10 completed workouts across all athletes (chronological)

Plus the existing counts cards (pending requests, active athletes, awaiting-first-sign-in) stay.

---

## 2. Scope

### In scope
- 4 query functions in `lib/coach-dashboard/`, each returning a typed result list
- `/coach` page rebuild: keeps the counts grid + adds 4 new alert sections
- RLS already in place — coaches see only their own athletes' data via existing policies
- Unit tests for any non-trivial logic (date math)
- Integration tests for the queries themselves (3-4 cases each)
- Light e2e: coach signs in, sees the new sections render

### Out of scope (deferred)
- **PR detection** (notable weight on a lift) — needs e1RM math; V1.5+
- **Trend charts / graphs** — V1.5+
- **Drill-down detail pages** — V1: alerts link directly to the existing athlete detail page
- **Notification bell / unread states** — V1.5+
- **Email digests** ("here's what happened this week") — V1.5+

---

## 3. Decisions

| Decision | Value | Why |
|---|---|---|
| Missed-workout window | **7 days since last completed workout_log**, only for athletes with an assigned active program | Real "is this athlete training?" signal. Athletes without an assigned program are excluded — they can't miss what hasn't been programmed. |
| Pain reports window | **14 days** | Two weeks captures recurring complaints without flooding the dashboard. |
| Low-readiness criteria | **fatigue ≥ 8 OR soreness ≥ 8 OR motivation ≤ 3** in any check_in submitted in the last 14 days | Matches typical coach concern thresholds. Excludes pain (already its own card). |
| Recent activity feed | **last 10 completed workout_logs**, any athlete | Quick "what's been happening" view. |
| Empty states | Each section shows a friendly "Nothing to flag" line if empty | Consistency. Coach should see green-light sections, not empty silence. |
| Section ordering | Most actionable first: missed workouts → pain → low readiness → recent activity → existing counts | Highest-priority signals at top. |
| Mobile vs desktop | Desktop-first per V1 §3 (coach is desktop-first) | Two columns on md+, single column on mobile. Existing layout pattern. |
| Performance | All four queries run in parallel via `Promise.all` | Single page load. |
| Linking | Each alert row links to `/coach/athletes/[id]` for drill-down | Reuses existing detail page (Plans 3-5 sections live there). |

---

## 4. Schema changes

**None.** Plan 6 is read-only against existing tables: workout_logs, check_ins, athletes, programs.

---

## 5. Page map

| Route | Change |
|---|---|
| `/coach` | Replace "Coming soon" section with 4 alert sections + recent-activity feed |

No new routes.

---

## 6. Server queries

| Function | Returns |
|---|---|
| `listMissedWorkoutAthletes()` | Athletes with assigned active programs whose last completed workout_log is >7 days old (or who have no logs yet). Returns `{ athleteId, athleteName, lastLoggedAt: string \| null }[]`. |
| `listRecentPainReports(limit=10)` | Recent (≤14 days) workout_logs OR check_ins with non-empty pain_notes. Returns `{ source: 'workout' \| 'check-in', athleteId, athleteName, painNotes, at: timestamp, ... }[]`. |
| `listLowReadinessCheckIns(limit=10)` | Recent (≤14 days) check_ins matching criteria. Returns rows with athlete name + week_starting + the offending metric values. |
| `listRecentActivity(limit=10)` | Last 10 completed workout_logs across all athletes. Returns athlete name + program day name + completed_at. |

All gated by `getCurrentCoach()` for auth, RLS does the actual scoping.

---

## 7. Validation

No user input; read-only queries. No Zod needed.

---

## 8. Test plan

### 8.1 Vitest unit (~1-2 tests)
- Days-since-date helper (if extracted; otherwise skip)

### 8.2 Vitest integration (~5 tests)
- listMissedWorkoutAthletes: athlete with no program excluded · athlete with recent log excluded · athlete with stale log included · athlete with NO logs but assigned program included
- One spot-check for each of the other three queries (verifies SQL compiles + returns shape)

### 8.3 Playwright e2e (~1 test)
- Coach signs in, visits `/coach`, sees the 4 new section headings

---

## 9. UX

- Each alert card has its own gold-bordered container
- Empty states: "No missed workouts." / "No pain reports." etc.
- Each row in a list is a `<Link>` to `/coach/athletes/[id]` (full-row tappable)
- Vault aesthetic preserved
- `bg-[#16140f]` for card backgrounds (matches Plans 4-5)
- Compact list rows (avoid scroll-fatigue)

---

## 10. Edge cases

- Coach with zero athletes → all sections empty + friendly text
- Athlete with a one-week-old log on day 7.0 exactly — included (>7 means strict)
- Athlete who deleted account mid-test — RLS hides; section just shows fewer rows
- Very long pain notes — truncate to ~80 chars in the list
- Coach with hundreds of athletes — limit each list to 10 rows; "View all athletes →" link to roster

---

## 11. Out of scope (V1.5+)

- PR detection
- Trend charts
- Drill-down detail pages beyond athlete-detail
- Notification bell
- Email digests

---

## 12. Next step

Input to writing-plans → execute via subagent-driven-development.
