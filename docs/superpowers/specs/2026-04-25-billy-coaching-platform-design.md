# Billy — Powerlifting Coaching Platform: Design Spec

**Date:** 2026-04-25
**Status:** Design (pending user review → implementation plan)
**First customer:** William Steele (national-level powerlifting coach)
**Platform owner:** project owner (referred to throughout as "the operator")

---

## 1. Project context

Billy is a multi-tenant SaaS coaching platform built for competitive powerlifters. The first paying tenant is William Steele's coaching business. The platform is designed to scale nationwide as additional coaches are added in V2.

Source documents (`C:\Users\van\Desktop\billy\`):
- `Claude-by-Anthropic-for-Word.docx` — master system prompt for an AI powerlifting program generator (deferred from V1).
- `Claude-by-Anthropic-for-Word 1.docx` — full MVP product spec for the coaching app.

The operator is non-technical and builds with Claude Code. They own the infrastructure (GitHub, Vercel, Supabase, Resend accounts) and intend to charge William a monthly subscription once the platform scales.

---

## 2. V1 scope

V1 ships **two products together**:

1. **Coaching Core** — coach + athlete dashboards, program assignment, workout logging, weekly check-ins.
2. **Donations subsystem** — public opt-in athlete profiles, Stripe Connect–powered donations to William's business account.

### In V1

- Email magic-link authentication (no passwords).
- Invite-only athlete onboarding (William invites by email).
- Public "Request to Join" form with William's approval queue.
- Single-coach experience (William is the only coach in V1, but data model is multi-tenant from Day 1).
- Athlete dashboard with today's workout, week-at-a-glance, latest feedback, meet countdown.
- Workout logging with per-set capture (weight, reps, RPE).
- Weekly check-ins (bodyweight, fatigue, soreness, etc.).
- Coach dashboard with alerts (missed workouts, low readiness, pending requests, recent PRs).
- Program builder with weeks → days → exercises hierarchy. Templates supported.
- **Public athlete profiles (opt-in, coach-approved)** — for donation discovery.
- **Donation flow** via Stripe Connect Standard accounts (William as merchant of record).
- Premium "Vault" aesthetic across all surfaces.
- Marketing landing page with William's bio and team credibility content.

### Deferred (V1.1 / V1.5 / V2)

- AI program generator (Doc 1's system prompt).
- Video upload & review.
- In-app messaging.
- Coach signup / multi-coach onboarding flow.
- Coach billing (operator → coach subscriptions).
- Mobile native apps.
- Public coach directory.
- Advanced analytics / progress charting beyond basics.
- Audit log of admin actions.
- Formal accessibility audit, cross-browser matrix beyond Chrome + Safari.

---

## 3. Constraints & decisions

| Decision | Value | Why |
|---|---|---|
| Form factor | Responsive web app | No app stores, no install friction; one codebase. |
| Builder | Operator + Claude Code | Stack and tooling chosen to maximize Claude support and minimize ops burden. |
| Tech stack | Next.js (App Router) + Supabase + Vercel + Resend | Most "boring tech" path; massive Claude training data; managed services minimize maintenance. |
| Auth | Supabase magic-link, invite-only | No passwords to leak/reset; invite-only matches private coaching business. |
| Public discovery | Opt-in only | Athlete profiles default private; explicit publish required. Privacy by default. |
| Donations merchant of record | William | Operator/platform takes 0% in V1. Stripe Connect Standard accounts. |
| Donations live at | V1 launch (Option Y) | Operator's choice over phased Option X. Tradeoff: longer initial build. |
| Visual direction | "Vault" — black/gold/serif | Premium, championship-grade. Editorial, not gym-aesthetic. |
| Internal weight unit | Stored as `lbs` | Single canonical unit. Display unit per-user (lbs default, kg toggleable). |
| Infrastructure isolation | Fresh GitHub repo, fresh Vercel project, fresh Supabase project | Isolated from operator's other personal projects. |

---

## 4. Architecture

```
┌─────────────────────────────────────────────────┐
│  Browser (phone or laptop)                      │
│  Next.js app — pages, dashboards, forms         │
└────────────────────┬────────────────────────────┘
                     │ HTTPS
┌────────────────────┴────────────────────────────┐
│  Vercel                                         │
│  Hosts Next.js. Server actions & API routes.    │
│  Auto-deploys on push. Edge functions.          │
└────┬───────────────┬────────────────────┬───────┘
     │               │                    │
┌────┴─────┐  ┌──────┴──────┐    ┌────────┴─────────┐
│ Supabase │  │   Resend    │    │  Stripe Connect  │
│ Postgres │  │ Transactional│    │  (Standard accts)│
│ Auth     │  │   email      │    │  William's       │
│ Storage  │  │              │    │  account         │
│ RLS      │  │              │    │                  │
└──────────┘  └─────────────┘    └──────────────────┘
```

**Service responsibilities:**
- **Vercel** — hosts the Next.js app, runs server-side logic, terminates HTTPS, auto-deploys from GitHub.
- **Supabase** — Postgres database, magic-link auth, file storage (athlete photos, program PDFs eventually). Row-Level Security enforced on every table.
- **Resend** — transactional email: magic-link emails, request-to-join notifications, donation receipts, weekly check-in reminders.
- **Stripe Connect (Standard)** — donation processing. William has his own connected Stripe account; the platform initiates Checkout Sessions on his behalf via the Connect API. Money lands in his account, not the platform's.

**No separate backend server.** Next.js handles its own server-side logic via App Router server components, server actions, and API routes. One repo, one codebase.

**Environments:** production only at first. Add a Vercel preview branch (`develop`) before V1.1.

**Domain:** TBD by operator. Before launch: register domain, add DNS, configure Resend domain auth (DKIM/DMARC/SPF), Stripe TOS sign-off.

---

## 5. Roles & permissions

| Role | Created when | Sees | Can do |
|---|---|---|---|
| **Coach** | Created by operator (V1: just William) | All athletes under their `coach_id`, all programs, all logs, all check-ins, all join requests, all donations to their account | Invite athletes, build/assign programs, approve/reject join requests, edit any athlete's profile, approve athlete public profiles, view donations, refund donations, edit own profile |
| **Athlete** | Coach invites them OR a join request is approved | Their own program, their own logs, their own check-ins, their own donations, their own public profile editor | Log workouts, submit check-ins, edit own profile, edit/publish own public profile (subject to coach approval), see donations they've received |
| **Prospective athlete** | Submitted a `join_requests` row | N/A (no login until approved) | Wait |
| **Public visitor** | N/A | Landing page, public team list, individual public athlete pages, donation flow | Submit a join request, donate to a public athlete |

### Permission enforcement (two layers)

1. **Middleware** (Next.js) — checks role per route, redirects unauthorized requests.
2. **Postgres Row-Level Security** — enforced at the database layer. Even with a leaked anon key, athletes cannot SELECT another athlete's rows. RLS policies are the real security guarantee.

Sample RLS policy (athletes can only read their own logs):
```sql
CREATE POLICY athlete_reads_own_logs ON workout_logs
FOR SELECT USING (athlete_id = (
  SELECT id FROM athletes WHERE auth_user_id = auth.uid()
));
```

---

## 6. Data model

Tables below. All weights stored in **lbs** internally; per-user display preference handled at the UI layer.

### 6.1 Identity tables

**`coaches`**
- `id` (uuid, pk)
- `auth_user_id` (uuid, fk → `auth.users`)
- `display_name` (text)
- `email` (text, unique)
- `phone` (text, nullable)
- `business_name` (text, nullable)
- `bio` (text, nullable) — used on public landing/about page
- `weight_unit_preference` (enum: `lbs`|`kg`, default `lbs`)
- `stripe_account_id` (text, nullable) — set after Stripe Connect onboarding
- `stripe_charges_enabled` (bool, default false) — synced from Stripe webhook
- `created_at` (timestamptz)

**`athletes`**
- `id` (uuid, pk)
- `coach_id` (uuid, fk → `coaches`)
- `auth_user_id` (uuid, fk → `auth.users`, nullable until invite accepted)
- `name` (text)
- `email` (text, unique)
- `weight_class` (text) — e.g. `198`, `SHW`
- `raw_or_equipped` (enum: `raw`|`equipped`)
- `current_squat_max` (numeric, lbs)
- `current_bench_max` (numeric, lbs)
- `current_deadlift_max` (numeric, lbs)
- `weak_points` (text)
- `injury_history` (text, nullable)
- `experience_level` (text)
- `goal` (enum: `hypertrophy`|`strength`|`meet_prep`|`general`)
- `meet_date` (date, nullable)
- `meet_name` (text, nullable)
- `coaching_type` (enum: `hybrid`|`online`)
- `start_date` (date)
- `weight_unit_preference` (enum: `lbs`|`kg`, default inherits from coach)
- `is_active` (bool, default true) — soft-delete flag
- `created_at` (timestamptz)

**`join_requests`**
- `id` (uuid, pk)
- `coach_id` (uuid, fk → `coaches`)
- `name` (text)
- `email` (text)
- `message` (text, nullable)
- `status` (enum: `pending`|`approved`|`rejected`, default `pending`)
- `internal_note` (text, nullable) — coach's own record
- `submitted_at` (timestamptz)
- `decided_at` (timestamptz, nullable)
- `decided_by` (uuid, fk → `coaches`, nullable)

### 6.2 Programming tables

**`programs`**
- `id` (uuid, pk)
- `coach_id` (uuid, fk → `coaches`)
- `athlete_id` (uuid, fk → `athletes`, nullable if `is_template=true`)
- `name` (text)
- `block_type` (enum: `hypertrophy`|`strength`|`peak`|`general`)
- `start_date` (date, nullable)
- `end_date` (date, nullable)
- `total_weeks` (int)
- `notes` (text, nullable)
- `is_template` (bool, default false)
- `is_active` (bool, default true)
- `version` (int, default 1) — for optimistic locking on concurrent edits
- `created_at` (timestamptz)

**`program_days`**
- `id` (uuid, pk)
- `program_id` (uuid, fk → `programs`)
- `week_number` (int)
- `day_number` (int)
- `name` (text) — e.g. `"Squat Day"`
- `notes` (text, nullable)

**`program_exercises`**
- `id` (uuid, pk)
- `program_day_id` (uuid, fk → `program_days`)
- `position` (int)
- `name` (text)
- `sets` (int)
- `reps` (text) — supports `"5"`, `"5,3,1"`, `"AMRAP"`
- `load_pct` (numeric, nullable) — % of relevant max
- `load_lbs` (numeric, nullable) — absolute load
- `rpe` (numeric, nullable)
- `notes` (text, nullable)

### 6.3 Logging tables

**`workout_logs`**
- `id` (uuid, pk)
- `athlete_id` (uuid, fk → `athletes`)
- `program_day_id` (uuid, fk → `program_days`)
- `status` (enum: `not_started`|`in_progress`|`completed`|`skipped`)
- `completed_at` (timestamptz, nullable)
- `pain_notes` (text, nullable)
- `general_notes` (text, nullable)
- `created_at` (timestamptz)
- *Unique constraint:* `(athlete_id, program_day_id)` — one log row per athlete per program day.

**`set_logs`**
- `id` (uuid, pk)
- `workout_log_id` (uuid, fk → `workout_logs`)
- `program_exercise_id` (uuid, fk → `program_exercises`)
- `set_number` (int)
- `weight_lbs` (numeric)
- `reps_done` (int)
- `rpe` (numeric, nullable)
- `completed` (bool, default false)
- `updated_at` (timestamptz) — for "auto-save in progress" behavior

### 6.4 Check-in table

**`check_ins`**
- `id` (uuid, pk)
- `athlete_id` (uuid, fk → `athletes`)
- `week_starting` (date)
- `bodyweight_lbs` (numeric)
- `fatigue` (int, 1–10)
- `soreness` (int, 1–10)
- `confidence` (int, 1–10)
- `motivation` (int, 1–10)
- `pain_notes` (text, nullable)
- `meet_readiness` (int, 1–10, nullable)
- `comments` (text, nullable)
- `submitted_at` (timestamptz)
- *Unique constraint:* `(athlete_id, week_starting)`.

### 6.5 Donations subsystem

**`athlete_public_profiles`**
- `id` (uuid, pk)
- `athlete_id` (uuid, fk → `athletes`, unique)
- `slug` (text, unique) — URL-safe, used in `/team/[slug]`
- `headline` (text) — e.g. `"Junior 198 — USAPL"`
- `bio` (text)
- `photo_url` (text, nullable) — Supabase Storage path
- `recent_meet_results` (jsonb) — array of `{meet, date, total_lbs, placement}`
- `is_published` (bool, default false) — coach-approved publish flag
- `published_at` (timestamptz, nullable)
- `coach_approved_by` (uuid, fk → `coaches`, nullable)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**`donations`**
- `id` (uuid, pk)
- `coach_id` (uuid, fk → `coaches`) — receiving coach
- `athlete_id` (uuid, fk → `athletes`) — athlete being supported (always set; donations are athlete-scoped)
- `amount_cents` (int) — stored in cents per Stripe convention
- `currency` (text, default `usd`)
- `donor_name` (text, nullable) — null if anonymous
- `donor_email` (text) — always captured for receipt
- `is_anonymous` (bool, default false) — controls public display only; receipt still goes to email
- `dedication_message` (text, nullable)
- `stripe_payment_intent_id` (text, unique)
- `stripe_checkout_session_id` (text, unique)
- `status` (enum: `pending`|`succeeded`|`failed`|`refunded`|`disputed`)
- `refunded_at` (timestamptz, nullable)
- `refund_reason` (text, nullable)
- `created_at` (timestamptz)
- `succeeded_at` (timestamptz, nullable)

### 6.6 Multi-tenancy guarantee

Every athlete-scoped row reaches a `coach_id` directly or via `athlete_id → coach_id`. Every public-facing query is scoped by `coach_id` in V1 (just William's). Adding coach #2 in V2 requires no schema changes.

---

## 7. Page map

### Public

| Route | Purpose |
|---|---|
| `/` | Marketing landing — William's bio, team credibility, "Request to Join" CTA, "Sign in" link. |
| `/about` | Deeper coach bio, philosophy, achievements. |
| `/team` | Public list of opted-in athletes (cards with name, weight class, headline). |
| `/team/[slug]` | Individual athlete public profile + donation CTA. |
| `/team/[slug]/donate` | Donation flow (amount, donor info, dedication, anonymous toggle) → redirects to Stripe Checkout. |
| `/donate/success` | Post-Stripe redirect; polls payment status as webhook fallback. |
| `/donate/canceled` | Post-Stripe cancel redirect. |
| `/request-to-join` | Public form: name + email + optional message. |
| `/login` | Email input → magic link sent. |
| `/auth/callback` | Magic-link redirect handler. |
| `/privacy` | Privacy policy. |
| `/terms` | Terms of service. |
| `/refund-policy` | Donation refund policy. |
| `/404`, `/error` | Friendly fallbacks. |

### Coach (`/coach/*`, role-gated)

| Route | Purpose |
|---|---|
| `/coach` | Dashboard — alerts, today's snapshot, pending requests, recent check-ins, missed-workout flags, recent donations. |
| `/coach/athletes` | Sortable athlete list. |
| `/coach/athletes/new` | Manual invite form. |
| `/coach/athletes/[id]` | Athlete detail with tabs: *Profile · Program · Workouts · Check-ins · Progress · Public Profile*. |
| `/coach/programs` | Program library (assigned + templates). |
| `/coach/programs/new` | Build new program. |
| `/coach/programs/[id]/edit` | Edit existing program. |
| `/coach/requests` | Join-requests inbox (Pending / Approved / Rejected tabs). |
| `/coach/donations` | Donations list, filterable by athlete & date. |
| `/coach/donations/[id]` | Donation detail with refund button. |
| `/coach/settings` | Account: name, weight-unit preference, business profile, Stripe Connect onboarding. |

### Athlete (`/app/*`, role-gated, athlete only sees own data)

| Route | Purpose |
|---|---|
| `/app` | Athlete dashboard. |
| `/app/onboarding` | First-time setup post-invite. |
| `/app/workout/[program_day_id]` | Today's session (log sets). |
| `/app/program` | Full program week-by-week. |
| `/app/check-in` | Weekly check-in form. |
| `/app/progress` | PRs, weight history, simple charts. |
| `/app/profile/public` | Editor for opt-in public profile (subject to coach approval). |
| `/app/donations` | Donations they've received. |
| `/app/settings` | Profile, weight-unit toggle, contact info. |

### Internal / API routes

| Route | Purpose |
|---|---|
| `/api/webhooks/stripe` | Stripe webhook receiver. Signing secret verified. Handles `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`, `account.updated` events. |
| `/api/webhooks/resend` | Resend webhook for delivery failures (bounces, complaints). Updates "delivery issues" widget on coach dashboard. |
| `/api/cron/check-in-reminders` | Vercel Cron (or Supabase scheduled function) fires Sunday 8am — emails athletes whose last check-in is >6 days old. |
| `/api/cron/cleanup-stale` | Daily cleanup job — expired magic-link tokens, abandoned join requests >30 days old (status remains, but flagged stale). |

---

## 8. Key user flows

### 8.1 Coach invites an athlete
1. William → `/coach/athletes/new` → enters name + email.
2. System creates `athletes` row (no `auth_user_id`), sends magic-link email via Resend.
3. Athlete clicks link → `/auth/callback` → `/app/onboarding`.
4. Wizard collects: weight class, raw/equipped, maxes, weak points, injury history, weight-unit preference, goal, optional meet date.
5. On submit → `auth_user_id` linked → `/app`.

### 8.2 Public request-to-join (approved)
1. Visitor → `/request-to-join` submits form.
2. `join_requests` row created (`pending`). Resend notifies William.
3. William → `/coach/requests` → **Approve**.
4. System creates `athletes` row + sends magic-link email. (Same as 8.1 from there.)

### 8.3 Public request-to-join (rejected)
1. Same start.
2. William clicks **Reject** with optional internal note.
3. Status set to `rejected`. Silent — no email to requester. *(Polite decline email = future enhancement.)*

### 8.4 Athlete logs a workout
1. Athlete `/app` → "Today's Workout" card.
2. `/app/workout/[id]` → exercise list with input fields per set.
3. Per set: weight, reps, RPE. Inputs auto-save on every change (resilience to closed tabs).
4. Optional pain/general notes.
5. Tap **Complete** → `status=completed`, `completed_at` stamped.
6. Coach dashboard reflects it on next load.

### 8.5 Weekly check-in
1. Sunday 8am: scheduled function emails athletes whose last check-in is >6 days old.
2. Athlete `/app/check-in` → submit form.
3. If meet ≤6 weeks: includes `meet_readiness`.
4. Submission flagged on coach dashboard if low readiness or pain reported.

### 8.6 Coach assigns / edits a program
1. William `/coach/programs/new` (or duplicates a template).
2. Configures block_type, weeks, days, exercises.
3. Saves → if `is_template=false`, athlete sees on next load.
4. Edits to future weeks live-update; completed days locked (history preserved). `version` column prevents lost updates from concurrent edits.

### 8.7 Coach reviews & adjusts
1. William `/coach` → alerts feed.
2. Drills into athletes flagged for missed workouts, pain, low readiness, or PRs.
3. Edits future weeks if needed.

### 8.8 Athlete publishes public profile (donations gating step)
1. Athlete `/app/profile/public` → fills out headline, bio, optionally uploads photo, lists recent meet results.
2. Saves → state: `is_published=false`, queued for coach approval.
3. William `/coach/athletes/[id]` → Public Profile tab → reviews → **Approve & Publish** or sends back with notes.
4. On approval: `is_published=true`, athlete becomes visible on `/team` and `/team/[slug]`.

### 8.9 Donation flow
1. Visitor browses `/team` → picks an athlete → `/team/[slug]`.
2. Clicks **Support [Athlete]** → `/team/[slug]/donate`.
3. Enters amount, donor name (or anonymous), email, optional dedication.
4. Server creates `donations` row (`status=pending`) + Stripe Checkout Session via Connect (William's `stripe_account_id`).
5. Visitor redirected to Stripe Checkout → completes payment.
6. Stripe redirects to `/donate/success?session_id=...` — page polls payment status as webhook fallback.
7. Webhook (`checkout.session.completed`) updates `donations.status=succeeded`.
8. Resend sends donor receipt + notifies William of new donation.
9. Athlete sees the donation (anonymized if opted) on `/app/donations`.

### 8.10 Donation refund
1. William `/coach/donations/[id]` → **Refund** button.
2. Confirmation modal (refund is irreversible).
3. Stripe Refund API called.
4. Webhook (`charge.refunded`) updates `donations.status=refunded`.
5. Donor emailed refund confirmation.

---

## 9. Security posture

| Layer | Protection |
|---|---|
| Auth | Magic-link only. Sessions expire (Supabase default 1 hour for tokens, 1 week for sessions). |
| Database | Supabase RLS on every table. Postgres refuses cross-tenant queries even with leaked keys. |
| Transport | HTTPS enforced (Vercel + Supabase). |
| Secrets | All API keys in Vercel + Supabase env vars. Service role key never sent to client. Stripe secret key never client-side. |
| Input validation | Zod schemas server-side on every form action and API route. |
| Rate limiting | Public endpoints (request-to-join, magic-link send, donation form) rate-limited per IP. |
| Sensitive data | Pain/injury notes RLS-locked, never in URL params, scrubbed from Sentry breadcrumbs. |
| Webhooks | Stripe signing secret verified on every webhook. Resend webhooks verified similarly. |
| File uploads | Supabase Storage with signed URLs. MIME-type allowlist. Size limits enforced. |
| CSRF | Next.js server actions are CSRF-protected by default via origin checks. |
| Backups | Supabase Pro daily backups (7-day point-in-time recovery). Required for V1 launch (~$25/mo). |

**Out of V1:** SOC 2, 2FA for coaches, formal pentest, GDPR/HIPAA compliance, audit log of admin actions. Reassess at ≥10 paying coaches.

---

## 10. Maintenance & self-healing posture

### Self-managed by infrastructure

- **Servers:** none — Vercel + Supabase + Resend + Stripe are fully managed.
- **Deployment:** GitHub push → Vercel auto-deploys in ~30s. Failed deploy auto-rolls-back.
- **Database backups:** Supabase auto-backups daily (Pro tier).
- **Migrations:** schema lives in `/supabase/migrations`. Applied via `supabase db push`.
- **Dependency updates:** Renovate Bot opens PRs for new versions (especially security patches).
- **Type safety:** TypeScript end-to-end catches whole categories of bugs at build time.

### Self-healing on failures

| Failure mode | Recovery |
|---|---|
| Magic-link email send fails | Resend retries 3x. Persistent failures land in coach's "delivery issues" widget. |
| DB transaction error | Wrapped in transactions; user sees retryable error, no partial writes. |
| External service down (Resend / Stripe API) | Circuit breaker pattern; site keeps serving, queues outbound work. |
| Stale data (expired magic-link tokens, abandoned join requests) | Daily Supabase scheduled function cleans up. |
| Optimistic UI update fails | Auto-rollback with clean error. |
| Failed background job | Exponential backoff retries (1m → 5m → 30m). After 3 fails, dead-letter queue with notification. |
| Stripe webhook missed | Success page polls status as fallback; donations never get "stuck." |

### Observability

| Tool | Purpose | Cost at V1 scale |
|---|---|---|
| **Sentry** | Auto-captures every exception. Alerts on new error classes. | Free tier. |
| **Vercel Analytics** | Page traffic, performance, slow routes. | Free. |
| **Supabase Dashboard** | DB health, slow queries, auth events. | Included. |
| **BetterStack** (or UptimeRobot) | 5-minute uptime pings; SMS/email if down. | Free tier. |
| **Stripe Dashboard** | Payment events, dispute tracking. | Free. |

### Operator's actual maintenance burden

- **Most weeks:** nothing.
- **Bug appears:** Sentry alerts → paste error into Claude Code → review/merge PR → deployed.
- **Renovate dep PR:** click merge if CI green.
- **New feature:** describe → review → merge.
- **User report:** check Sentry; usually already captured.

---

## 11. Visual direction — "Vault"

| Attribute | Value |
|---|---|
| **Background** | Rich black (`#080808` to `#0c0c0c`) |
| **Foreground / text** | Warm off-white (`#f4f0e8`) |
| **Accent** | Gold (`#c9a14c`) |
| **Secondary text** | Warm grey (`#a39d8a`, `#8a8478`) |
| **Hairlines / dividers** | Very dark warm grey (`#1a1814`, `#1f1d18`) |
| **Headline typeface** | Editorial serif — recommend **Tiempos Headline**, **GT Super**, or open-source **Spectral**. Weight 400. Italic for emphasis. |
| **Body typeface** | Sans — **Inter** or **Söhne** (commercial). Open alternative: **Inter** for weight range. |
| **Numerals** | Tabular figures in dashboard data so columns align. |
| **Spacing** | Generous. White space is the design. |
| **Imagery** | Sparing, framed, considered. Black-and-white or duotone preferred. Never stock-photo gym imagery. |
| **Iconography** | Thin stroke (1.5px), geometric, no decorative flourishes. Phosphor or Lucide icon set. |
| **Buttons** | Border-only for secondary, filled gold for primary. Uppercase letterspaced labels for primary CTAs. |
| **Tables / data** | Sparse rules. Roman numeral week labels in serif as a brand cue (`Week III · Day II`). |
| **Motion** | Subtle. Easing curves are slow and deliberate (300–500ms). No bouncy animations. |
| **Dark/light mode** | Dark only in V1. |

Aesthetic comparison anchor: a private coaching firm or a luxury watch maker. *Not* a gym aesthetic.

---

## 12. Error handling, edge cases, testing

### Error handling philosophy

- **Never a white screen.** Error boundary on every page with a clean recovery path.
- **User-readable errors only.** Technical details go to Sentry, not the screen.
- **Network glitches:** silent auto-retry where safe; banner if persistent.
- **Forms:** inline validation client-side, authoritative validation server-side.

### Specific edge cases

| Case | Handling |
|---|---|
| Magic link expired (>1hr) | Friendly page with "Request a new link" button. |
| Double-submit (slow network) | Idempotent server-side; second submit no-ops. |
| Coach edits program while athlete mid-workout | Completed sets locked; future weeks update live; athlete sees "program updated" banner. |
| Stripe payment success, webhook fails | Stripe auto-retries; success page polls status as fallback. |
| Athlete deleted with logged data | Soft-delete (`is_active=false`); logs preserved. |
| Concurrent program edit (two tabs) | `version` column → last-write-wins with conflict warning. |
| Athlete tries to access `/coach/*` | Middleware bounce + RLS refuses data anyway. |
| Browser closed mid-workout | Inputs auto-saved on every change; resume on next visit. |
| Magic-link in spam | Resend domain auth (DKIM/DMARC/SPF) configured; UI shows resend option. |
| Stripe Connect account flagged/paused | Donation buttons hidden site-wide; coach dashboard alert. Coaching app stays functional. |
| Donation refund / chargeback | Webhook updates row; surfaced to coach dashboard. |
| Anonymous donation | Display name hidden; donor email still captured for receipt. |
| Athlete tries to publish public profile without coach approval | Stays `is_published=false`; appears in coach's pending-publication queue. |

### Testing

| Layer | Tool | V1 coverage |
|---|---|---|
| End-to-end critical paths | Playwright | Auth, invite, request-to-join + approval, workout log, check-in, donation purchase, donation refund. Happy paths + key failures. |
| Server logic / Zod schemas / RLS | Vitest | Unit-tested per function. RLS policies tested with Supabase test harness. |
| UI components | Vitest + Testing Library | Render + click smoke tests. |
| Visual regression | Manual V1 → Chromatic V1.1 | — |

CI: GitHub Actions runs the suite on every PR. Failed tests block Vercel deploy.

---

## 13. Pre-launch checklist (operator's responsibility, not dev work)

These items gate the public launch even when code is "done":

- [ ] Domain registered.
- [ ] DNS configured (Vercel + Resend domain verification).
- [ ] William's business entity formed (LLC or sole prop).
- [ ] William's EIN obtained.
- [ ] William's business bank account opened.
- [ ] William completes Stripe Connect onboarding (KYC).
- [ ] Privacy Policy hosted at `/privacy`.
- [ ] Terms of Service hosted at `/terms`.
- [ ] Refund Policy hosted at `/refund-policy` (gates Stripe activation for donations).
- [ ] Stripe TOS reviewed and signed by William.
- [ ] Resend domain authentication (DKIM/DMARC/SPF) verified.
- [ ] Supabase Pro tier activated (for daily backups).
- [ ] Sentry project created, DSN added to Vercel env vars.
- [ ] BetterStack uptime monitor configured.
- [ ] Test donation end-to-end in Stripe test mode → live mode.
- [ ] At least 3 athletes onboarded via Flow 8.1 in production.
- [ ] At least 1 successful real donation processed in test mode before going live.

**Recommendation:** start the William-side paperwork (entity, EIN, bank, Stripe KYC) on Day 1 of the build, in parallel with development.

---

## 14. Open questions / explicitly deferred

| Question | Disposition |
|---|---|
| Polite "decline" email when join request is rejected? | Not in V1; user can revisit. |
| Should William see donor identities even when donor opted anonymous? | Not specified. **Default: no** — anonymity respects donor's intent; William sees aggregate amount + donation but not identifying info. Confirm with operator. |
| Donation minimum/maximum amount? | Not specified. **Default: $5 min, $10,000 max** as a reasonable bound for V1; revisit. |
| Bodyweight unit display: does athlete's `weight_unit_preference` apply to bodyweight too, or only to lifts? | **Default: applies to both** for consistency. |
| Maximum file size for athlete public profile photo? | **Default: 5 MB.** |
| Cross-coach data sharing in V2 (athlete switches coaches)? | Not in V1. Schema supports `coach_id` change; UX deferred. |

---

## 15. Out of scope (explicit)

To prevent scope drift, the following are **NOT** part of V1:

- Native mobile apps (iOS/Android).
- AI program generator (Doc 1's system prompt) — V1.5+.
- Video upload and review.
- In-app messaging (coach ↔ athlete).
- Public coach directory / discovery.
- Coach signup / multi-coach onboarding flow.
- Operator-charges-coach billing.
- Marketplace, social feed, community forum.
- Advanced analytics (estimated 1RM, fatigue trend ML, etc.).
- Meal plan / nutrition tracking.
- Wearable integrations (Whoop, Oura, etc.).
- Full audit log of admin actions (V1.5).
- Formal accessibility audit.
- Cross-browser support beyond Chrome + Safari.
- 2FA, SOC 2, formal penetration testing.

---

## 16. Next step

This spec is the input to the **writing-plans** skill, which produces a step-by-step implementation plan with milestones, file-level decomposition, and a test-driven build order.
