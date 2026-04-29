# Plan 8 — Paying customers (Stripe Billing subscriptions)

**Date:** 2026-04-29
**Status:** Design draft. Implementation gated on William's Stripe account + LLC/EIN paperwork.
**Builds on:** Plan 2 (athletes/roster), Plan 2.5 (Resend), Plan 6 (coach dashboard).

## Goal

William can onboard paying coaching clients on monthly subscriptions, see who paid (and who didn't) on his dashboard, and the system sends a paid-invoice email automatically every successful charge. This is the **primary revenue stream** for Steele & Co. — coaching subscriptions are the business; donations (Plan 7b) are a side stream for the youth team.

After this work, William's flow is:

1. New client agrees to coaching → William opens `/coach/customers/new` → enters their name + email + chooses plan tier ($X/month).
2. System creates a Stripe Customer + Subscription, generates a Stripe Checkout link, sends it to the client via email.
3. Client pays. Stripe webhook fires `invoice.paid` → we insert a `payments` row, link it to the athlete (creating one if not yet), send a paid-invoice email branded as Steele & Co.
4. Failed payment → Stripe webhook fires `invoice.payment_failed` → we flag the subscription `past_due`, the coach dashboard "Failed" tile lights up rose, William sees who and follows up.
5. Recurring monthly: Stripe automatically charges the saved card; webhook fires; email sends; dashboard updates MRR / Active subs.

## Out of scope

- Stripe Connect / payouts to coaches other than William (multi-coach is V2).
- Self-serve client signup ("here's a public pricing page, click to subscribe"). V1 is coach-driven onboarding only — William sends the link.
- Coupons, trials, proration, plan upgrades/downgrades. V1 ships fixed monthly tiers; mid-cycle changes require manual Stripe dashboard action.
- Refunds in-app. V1 refunds happen in the Stripe dashboard; we just record the resulting refund webhook.
- Tax (Stripe Tax). Disabled for V1; William's accountant handles 1099/sales tax outside the app.
- Annual billing. V1 is monthly only.
- Dunning emails ("your card failed, please update"). Stripe's built-in dunning handles retry; we just surface the failed state on the dashboard.
- Donor / paying-customer overlap reporting. Treated as separate ledgers.

## Architecture

Three components:

- **Stripe Billing** — actual money movement. One Stripe account (William's, post-KYC). Products + Prices configured in the Stripe dashboard (one Product = "Steele & Co. coaching", one or more Prices = monthly tiers). Customers + Subscriptions created via API from our server actions. Webhooks delivered to `app/api/webhooks/stripe/route.ts`.
- **Our `payments` + `subscriptions` tables** — local mirror of Stripe state, RLS-scoped so William sees all and athletes see their own. We never trust local state for money decisions; Stripe is source of truth. We mirror so the coach dashboard and athlete-side "billing" page can render without a live Stripe API hit on every page load.
- **Resend (Plan 2.5)** — sends the paid-invoice email and the failed-payment notification. Templates live at `supabase/templates/` alongside the auth email templates, but we render and send via the Resend SDK directly (these are app sends, not Supabase auth emails).

Local dev uses Stripe's CLI (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`) plus test-mode keys. Production uses live keys + the real webhook endpoint registered in Stripe.

## Decisions

| Decision | Value | Why |
|---|---|---|
| Stripe product | Stripe Billing (subscriptions) — NOT Connect | William bills his own clients into his own bank. Connect is for marketplaces with multiple coaches; that's V2. |
| Plan tiers | Hardcoded in DB seed: 1 tier at $X/month for V1; can add more rows without code change | William has one coaching offering today; flexibility comes free. |
| Customer ↔ athlete link | One-to-one via `athletes.stripe_customer_id`; subscription auto-creates the athlete row on `invoice.paid` if missing | Decouples "client paid first, then signs in" vs "client invited first, then pays" — both work. |
| Checkout flow | Stripe Checkout (hosted page, redirect) — not embedded Elements | Less PCI scope, faster to ship, William doesn't see card numbers. |
| Webhook security | Verify signature with `STRIPE_WEBHOOK_SECRET`, idempotency via `stripe_event_id` unique on `payments` and `subscription_events` | Standard Stripe security baseline. |
| Failed-payment handling | Mark `subscription.status = 'past_due'`, show in dashboard, send notification to coach (NOT client — Stripe's own dunning emails the client) | Avoid double-emailing the client; coach owns the conversation. |
| Athlete-side billing page | `/app/billing` shows current plan, next billing date, payment history, "manage" button → Stripe Customer Portal | Stripe Customer Portal is a hosted page; no need to build subscription cancellation UI. |
| Cancellation | Coach can cancel (sets `cancel_at_period_end`); athlete can cancel via Customer Portal | Both paths supported; both end up at the same Stripe state. |
| Email on paid invoice | Renders from `supabase/templates/paid-invoice.html`, sent via Resend SDK with subject "Receipt — Steele & Co. coaching" | Branded, lands in any inbox per Plan 2.5. |
| Email on failed payment | Internal-only — to William, not the client | See above; Stripe dunning handles the client side. |
| Currency | USD only for V1 | William's clients are US. |

## Schema changes

Migration `0015_subscriptions_and_payments.sql`:

```sql
-- Plan tiers — seeded by William, displayed on /coach/customers/new
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  stripe_price_id text not null unique,
  name text not null,
  amount_cents integer not null check (amount_cents > 0),
  interval text not null check (interval in ('month', 'year')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- One subscription per athlete (V1 simplification)
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null unique references public.athletes(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null,
  plan_id uuid not null references public.plans(id),
  status text not null check (status in ('incomplete','active','past_due','canceled','unpaid','trialing')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_status_idx on public.subscriptions(status);

-- One row per Stripe invoice (paid or failed), for accounting + dashboard
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  athlete_id uuid references public.athletes(id) on delete set null,
  stripe_invoice_id text not null unique,
  stripe_event_id text not null unique,
  amount_cents integer not null,
  status text not null check (status in ('paid','failed','refunded')),
  paid_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  hosted_invoice_url text,
  receipt_url text,
  created_at timestamptz not null default now()
);
create index payments_athlete_idx on public.payments(athlete_id, paid_at desc);

-- Add Stripe customer FK to athletes (nullable; only set once they pay)
alter table public.athletes add column stripe_customer_id text unique;

-- RLS
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

-- Plans: anyone authenticated can SELECT (used to render coach onboarding form)
create policy app_plans_select on public.plans
  for select to authenticated using (true);

-- Subscriptions: athlete sees own, coach sees all of their athletes'
create policy app_subscriptions_athlete_select on public.subscriptions
  for select using (athlete_id = public.auth_athlete_id());
create policy app_subscriptions_coach_select on public.subscriptions
  for select using (athlete_id in (
    select id from public.athletes where coach_id = public.auth_coach_id()
  ));
-- INSERTs/UPDATEs only via service-role (webhook handler). No user-facing INSERT policy.

-- Payments: same pattern
create policy app_payments_athlete_select on public.payments
  for select using (athlete_id = public.auth_athlete_id());
create policy app_payments_coach_select on public.payments
  for select using (athlete_id in (
    select id from public.athletes where coach_id = public.auth_coach_id()
  ));
```

## Page map

| Route | Auth | Purpose |
|---|---|---|
| `/coach/customers` | coach | List of paying customers — name, plan, status, MRR contribution, last payment, "view" link |
| `/coach/customers/new` | coach | Form: client name + email + plan tier → creates Stripe Customer + Subscription, returns Checkout link to copy/email |
| `/coach/customers/[id]` | coach | One customer detail — payment history, current status, "cancel at period end" button |
| `/app/billing` | athlete | Athlete's own billing — current plan, next billing date, payments, "manage" button → Stripe Customer Portal |
| `/api/webhooks/stripe` | public (signature-verified) | Stripe webhook receiver |

Modify `/coach` dashboard: replace the "Plan 8 — coming" placeholder card with real numbers (count of `subscriptions where status='active'`, sum of `plans.amount_cents`, count of `subscriptions where status='past_due'`).

## Server actions / route handlers

| Function | Purpose |
|---|---|
| `lib/billing/actions/create-customer.ts` `createCustomer(input)` | Coach-side. Validates input, creates Stripe Customer, creates Subscription with `payment_behavior='default_incomplete'`, generates a Checkout Session URL, returns it. |
| `lib/billing/actions/cancel-subscription.ts` `cancelSubscription(subscriptionId)` | Coach-side. Calls Stripe to set `cancel_at_period_end=true`. |
| `lib/billing/list-customers.ts` `listPayingCustomers()` | Coach dashboard fetcher. Joins athletes + subscriptions + plans + last payment. |
| `lib/billing/list-payments.ts` `listAthletePayments(athleteId)` | Used by both coach detail page and athlete billing page (RLS gates). |
| `lib/billing/get-mrr.ts` `getCoachMRR()` | Sums active subscriptions' plan.amount_cents. |
| `lib/billing/get-customer-portal-url.ts` `getCustomerPortalUrl()` | Athlete-side. Generates a Stripe Customer Portal session, returns URL. |
| `app/api/webhooks/stripe/route.ts` POST | Verifies signature, dispatches by event type to handlers below. |
| `lib/billing/webhook-handlers/invoice-paid.ts` | Idempotent (checks `stripe_event_id`). Inserts/updates payment row, sends paid-invoice email via Resend. |
| `lib/billing/webhook-handlers/invoice-payment-failed.ts` | Idempotent. Updates payment row + subscription.status='past_due'. Sends internal alert to William. |
| `lib/billing/webhook-handlers/subscription-updated.ts` | Idempotent. Mirrors Stripe subscription state to local row. |
| `lib/billing/webhook-handlers/subscription-deleted.ts` | Idempotent. Marks local subscription canceled. |
| `lib/billing/webhook-handlers/customer-created.ts` | If athlete row doesn't exist for this email, create one with status='active' and link via stripe_customer_id. (This is the "client paid first, then signs in" path.) |

All webhook handlers run with the service-role Supabase client (bypasses RLS); the route handler enforces signature verification before dispatch.

## Validation

```ts
export const createCustomerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(254),
  planId: z.string().uuid(),
});
```

## Email template

`supabase/templates/paid-invoice.html` — Vault aesthetic. Variables: `{{ athlete_name }}`, `{{ plan_name }}`, `{{ amount_formatted }}`, `{{ paid_at_formatted }}`, `{{ receipt_url }}`, `{{ next_period_end_formatted }}`.

Subject: `Receipt — Steele & Co. coaching`.

`supabase/templates/payment-failed-internal.html` — Plain, terse. Sent only to William's coach email. Variables: `{{ athlete_name }}`, `{{ amount_formatted }}`, `{{ failure_reason }}`, `{{ stripe_dashboard_url }}`.

Subject: `Failed payment — {{ athlete_name }}`.

## Tests

- **Unit:** Zod schema validation. Webhook idempotency (running the same event twice produces one row).
- **Integration:** RLS — coach sees own customers' subscriptions/payments; athlete sees only own; cross-coach blocked. Webhook flows mocked at the Stripe SDK boundary using `stripe.webhooks.constructEvent` with a known fixture body + signature.
- **E2e:** Coach creates a customer, the test runs Stripe CLI to fire a fake `invoice.paid` event, dashboard updates MRR, athlete sees payment in their billing page, paid-invoice email lands in Inbucket.

## Edge cases

| Case | Handling |
|---|---|
| Webhook delivered twice (Stripe retries) | `stripe_event_id` unique; second insert no-ops with `on conflict do nothing`. |
| Webhook arrives before athlete row exists | `customer.created` handler creates the athlete first; `invoice.paid` handler upserts. |
| Athlete cancels via Customer Portal | `customer.subscription.updated` event with `cancel_at_period_end=true` → mirror locally. |
| Coach deletes athlete → cascade | `subscriptions ON DELETE CASCADE` from athletes; `payments` keeps with `athlete_id` set null for accounting history. |
| Plan tier changes price after subscription exists | Existing subscriptions keep their original price (Stripe behavior); `plans` table stores immutable `stripe_price_id` per row, new tier = new row. |
| Stripe webhook signature invalid | Return 400; do NOT process. Log a Sentry breadcrumb. |
| Race: two webhooks for same subscription | Last-write-wins on `subscriptions.updated_at`; status field is monotonic per Stripe's event ordering guarantee. |

## V1.5+ followups

- Annual plan tiers
- In-app refund button (currently Stripe dashboard only)
- Coupons + trials
- Multi-coach Stripe Connect
- Tax via Stripe Tax
- Dunning emails branded (currently Stripe-default)
- Public pricing page + self-serve signup

## Prerequisites William must complete before implementation can start

1. LLC formed (or sole-prop OK if he's comfortable) + EIN.
2. Business bank account.
3. Stripe account created at stripe.com → KYC submitted (legal name, EIN, bank, address, ID upload). Usually approves in 24-48h.
4. Decide V1 plan tier(s) and price points (e.g., "$200/month coaching"). Van or William creates the Product + Price in Stripe dashboard; Van seeds the `plans` table with the resulting `price_id`.
5. Decide who gets the failed-payment email (William's personal email vs. a shared coach@ inbox).

Once 1-5 are done, this plan ships in 2-3 days of focused work.

## Next step

User reviews this spec → approve → write implementation plan → execute via subagent-driven development.
