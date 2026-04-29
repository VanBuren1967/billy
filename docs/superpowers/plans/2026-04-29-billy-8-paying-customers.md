# Plan 8 — Paying customers (Stripe Billing subscriptions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. The spec at `docs/superpowers/specs/2026-04-29-billy-plan-8-paying-customers-design.md` has all the SQL, Zod, and helper code blocks. This plan organizes the work into tasks; refer to spec for verbatim content.

**Goal:** Ship Stripe Billing subscriptions — coach onboards a paying client, system bills monthly, paid-invoice emails go out, dashboard surfaces MRR / past-due. The primary revenue stream for Steele & Co.

**Builds on:** Plans 1–7a + 3.5. Reuses `auth_coach_id()`, `auth_athlete_id()`, `getCurrentCoach`, `getCurrentAthlete`, the Resend SDK from Plan 2.5, and the Sentry breadcrumb pattern.

**Working dir:** `C:\Users\van\Desktop\billy`. Prefix shell with `cd "/c/Users/van/Desktop/billy" &&`.

**Hard prerequisites — DO NOT START until ALL are confirmed:**

1. William's Stripe account is live (KYC complete, bank linked).
2. Billy or Van has created a Stripe **Product** + at least one **Price** in the Stripe dashboard (test-mode AND live-mode). Recurring monthly USD.
3. `STRIPE_SECRET_KEY` (live + test) and `STRIPE_WEBHOOK_SECRET` (test) are set in `.env.local` and Vercel.
4. Resend domain is verified in production (Plan 2.5 prod cutover) — paid-invoice emails need a real `From:` address.

If any of 1–4 are missing, **STOP and escalate.** Don't fake it; this is real money plumbing.

---

## File map

| Path | Purpose |
|---|---|
| `supabase/migrations/0017_subscriptions_and_payments.sql` | `plans`, `subscriptions`, `payments` + RLS (spec §4) |
| `scripts/seed-plans.ts` | Idempotent: seed `plans` table from `STRIPE_PRICE_ID_*` env vars |
| `lib/billing/stripe.ts` | One Stripe SDK instance (`new Stripe(...)`), exports `stripe` |
| `lib/billing/schemas.ts` | Zod (spec §7: `createCustomerSchema`) |
| `lib/billing/list-customers.ts` | `listPayingCustomers()` for coach dashboard |
| `lib/billing/list-payments.ts` | `listAthletePayments(athleteId)` |
| `lib/billing/get-mrr.ts` | `getCoachMRR()` returns `{ activeSubs, mrrCents, pastDueCount }` |
| `lib/billing/get-customer-portal-url.ts` | Athlete-side: returns Stripe Customer Portal session URL |
| `lib/billing/actions/create-customer.ts` | Coach action — creates Stripe Customer + Subscription + Checkout link |
| `lib/billing/actions/cancel-subscription.ts` | Coach action — sets `cancel_at_period_end=true` |
| `lib/billing/webhook-handlers/invoice-paid.ts` | Idempotent insert on `payments`; sends paid-invoice email |
| `lib/billing/webhook-handlers/invoice-payment-failed.ts` | Idempotent; sets `past_due`; sends internal alert to William |
| `lib/billing/webhook-handlers/subscription-updated.ts` | Mirrors Stripe state to local `subscriptions` row |
| `lib/billing/webhook-handlers/subscription-deleted.ts` | Marks local subscription canceled |
| `lib/billing/webhook-handlers/customer-created.ts` | Backfills `athletes.stripe_customer_id` |
| `app/api/webhooks/stripe/route.ts` | POST handler: signature verify + dispatch |
| `app/coach/customers/page.tsx` | Customers list (server component) |
| `app/coach/customers/new/page.tsx` + `new-customer-form.tsx` | Onboarding form (client) |
| `app/coach/customers/[id]/page.tsx` | One-customer detail with payment history |
| `app/app/billing/page.tsx` | Athlete-facing billing page + portal link |
| `supabase/templates/paid-invoice.html` | Vault-aesthetic receipt template |
| `supabase/templates/payment-failed-internal.html` | Plain alert to coach |
| `lib/email/templates/paid-invoice.ts` | Renders the paid-invoice HTML + plaintext |
| `lib/email/templates/payment-failed-internal.ts` | Same for the failure alert |
| `tests/integration/billing/rls.test.ts` | RLS — coach sees own customers, athlete sees own subs/payments, cross-coach blocked |
| `tests/integration/billing/webhook-idempotency.test.ts` | Same `stripe_event_id` twice → one row |
| `tests/integration/billing/customer-created-backfill.test.ts` | `customer.created` before athlete row exists creates the row |
| `tests/unit/billing/schemas.test.ts` | Zod accept/reject |
| `tests/unit/billing/email-templates.test.ts` | Template renders with substituted vars |
| `tests/e2e/billing/coach-onboards-customer.spec.ts` | Coach creates customer → fixture `invoice.paid` event → MRR updates → athlete sees payment |
| `app/coach/page.tsx` (modify) | Replace "Plan 8 — coming" placeholder with real numbers from `getCoachMRR()` |
| `proxy.ts` (modify) | Add `/api/webhooks/stripe` to `isPublic()` allowlist |
| `.env.example` (modify) | Document `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_BASE` |

---

## Tasks

### Task 1: Migration 0017 + RLS integration test (TDD)

Write failing test first; apply migration; verify green. Verbatim SQL in spec §4.

Integration test cases (`tests/integration/billing/rls.test.ts`, ~8 cases):

- Coach A SELECTs own athletes' subscriptions and payments
- Coach B cannot SELECT coach A's subs/payments
- Athlete A SELECTs own subscription and payments
- Athlete A cannot SELECT athlete B's subscription
- Anonymous client cannot SELECT any subs/payments
- Plans: any authenticated user can SELECT
- INSERT to `subscriptions` from a user-role client is denied (only service-role / webhook handlers write)
- Same for `payments`

Use `makeUserClient` pattern. For the no-INSERT-policy assertion, expect `error.code === '42501'` or empty data.

Commit: `feat(billing): subscriptions + payments + plans tables + RLS`.

### Task 2: Stripe SDK + Zod + plans seed + unit tests

Create `lib/billing/stripe.ts`:

```ts
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error('STRIPE_SECRET_KEY is not set');

export const stripe = new Stripe(key, {
  // Pin the API version to the one the SDK ships with — opt out of
  // automatic upgrades that could break webhook handler shape assumptions.
  apiVersion: '2025-08-27.basil',
});
```

Schemas in `lib/billing/schemas.ts` per spec §7. Unit tests (~3): valid input, missing email rejected, planId UUID rejected if not UUID.

Seed script `scripts/seed-plans.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PRICE_ID = process.env.STRIPE_PRICE_ID_BASE;
const AMOUNT = Number(process.env.STRIPE_PRICE_AMOUNT_CENTS); // e.g. 20000 = $200

if (!PRICE_ID || !AMOUNT) {
  console.error('Set STRIPE_PRICE_ID_BASE and STRIPE_PRICE_AMOUNT_CENTS');
  process.exit(1);
}

const admin = createClient(URL, SR, { auth: { persistSession: false } });

const { data: existing } = await admin
  .from('plans')
  .select('id')
  .eq('stripe_price_id', PRICE_ID)
  .maybeSingle();

if (existing) {
  console.log(`Plan already seeded: ${PRICE_ID}`);
  process.exit(0);
}

const { error } = await admin.from('plans').insert({
  stripe_price_id: PRICE_ID,
  name: 'Steele & Co. Coaching — Monthly',
  amount_cents: AMOUNT,
  interval: 'month',
  active: true,
});
if (error) {
  console.error(error);
  process.exit(1);
}
console.log(`Seeded plan ${PRICE_ID} at ${AMOUNT} cents/month`);
```

Run: `pnpm dlx tsx scripts/seed-plans.ts`. Add to README setup section.

Commit: `feat(billing): Stripe SDK wrapper + Zod + plans seed`.

### Task 3: Webhook route handler scaffolding (signature verify, no handlers yet)

Create `app/api/webhooks/stripe/route.ts`:

```ts
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/billing/stripe';

export const runtime = 'nodejs'; // Stripe.webhooks.constructEvent needs Node, not Edge

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET is not set');

export async function POST(request: Request) {
  const body = await request.text(); // RAW — not parsed as JSON
  const sig = (await headers()).get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'no signature' }, { status: 400 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (e) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  // Dispatch added in Task 4.
  return NextResponse.json({ received: true, type: event.type });
}
```

Modify `proxy.ts` `isPublic()` — add `pathname.startsWith('/api/webhooks/')` (already there from Plan 2.5? if not, add).

Manual verification (skip if Stripe CLI not installed):
- `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (writes the webhook secret to terminal)
- Set `STRIPE_WEBHOOK_SECRET=whsec_...` in `.env.local`
- `stripe trigger checkout.session.completed` — should see `{received: true, type: 'checkout.session.completed'}` in dev server log

Commit: `feat(billing): /api/webhooks/stripe route with signature verification`.

### Task 4: Webhook handlers (TDD — idempotency test first)

Write integration test first: `tests/integration/billing/webhook-idempotency.test.ts`. Mocks the Stripe constructEvent boundary; calls each handler twice with the same `stripe_event_id`; asserts only one DB row.

Handlers per spec §6:

- `lib/billing/webhook-handlers/invoice-paid.ts` — service-role Supabase client; idempotent via `on conflict (stripe_event_id) do nothing`; on first insert, send paid-invoice email via Resend.
- `lib/billing/webhook-handlers/invoice-payment-failed.ts` — idempotent; updates `subscriptions.status='past_due'`; sends internal alert.
- `lib/billing/webhook-handlers/subscription-updated.ts` — upsert by `stripe_subscription_id`; mirror Stripe state.
- `lib/billing/webhook-handlers/subscription-deleted.ts` — set `status='canceled'`, `canceled_at=now()`.
- `lib/billing/webhook-handlers/customer-created.ts` — if no `athletes.stripe_customer_id` matches, look up by email and backfill; if no athlete row, no-op.

Each handler:
```ts
export async function handleInvoicePaid(event: Stripe.Event, admin: SupabaseClient) {
  if (event.type !== 'invoice.paid') return;
  const invoice = event.data.object as Stripe.Invoice;
  // ... extract stripe_subscription_id, amount_paid, etc.
  const { error } = await admin.from('payments').insert({
    stripe_invoice_id: invoice.id,
    stripe_event_id: event.id,
    amount_cents: invoice.amount_paid,
    status: 'paid',
    paid_at: new Date(invoice.status_transitions.paid_at! * 1000).toISOString(),
    receipt_url: invoice.hosted_invoice_url,
    // ... lookup subscription_id + athlete_id by stripe_customer_id
  });
  if (error?.code === '23505') return; // duplicate event — already processed
  if (error) throw error;
  // Send paid-invoice email — but only on FIRST insert
  await sendPaidInvoiceEmail({ ... });
}
```

Wire dispatch in `app/api/webhooks/stripe/route.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin';
import { handleInvoicePaid } from '@/lib/billing/webhook-handlers/invoice-paid';
// ... other imports

const admin = createAdminClient();
switch (event.type) {
  case 'invoice.paid': await handleInvoicePaid(event, admin); break;
  case 'invoice.payment_failed': await handleInvoicePaymentFailed(event, admin); break;
  case 'customer.subscription.updated':
  case 'customer.subscription.created': await handleSubscriptionUpdated(event, admin); break;
  case 'customer.subscription.deleted': await handleSubscriptionDeleted(event, admin); break;
  case 'customer.created': await handleCustomerCreated(event, admin); break;
  default: break; // ignore unrecognized event types
}
return NextResponse.json({ received: true });
```

Wrap the dispatch in try/catch — if a handler throws, return 500 so Stripe retries; capture to Sentry.

Commit: `feat(billing): webhook handlers + idempotency`.

### Task 5: Server actions (createCustomer, cancelSubscription) + fetchers

`lib/billing/actions/create-customer.ts`:

```ts
'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { stripe } from '@/lib/billing/stripe';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentCoach } from '@/lib/coach/get-current-coach';
import { createCustomerSchema } from '@/lib/billing/schemas';

export async function createPayingCustomer(input: unknown) {
  const p = createCustomerSchema.safeParse(input);
  if (!p.success) return { ok: false as const, message: p.error.message };
  const { coachId } = await getCurrentCoach();

  const supabase = await createClient();
  const { data: plan } = await supabase
    .from('plans').select('stripe_price_id, name').eq('id', p.data.planId).single();
  if (!plan) return { ok: false as const, message: 'plan not found' };

  // Stripe Customer
  const customer = await stripe.customers.create({
    email: p.data.email,
    name: p.data.name,
    metadata: { coach_id: coachId, source: 'coach-onboarding' },
  });

  // Subscription with default_incomplete payment behavior — first invoice is finalized
  // but not paid; client pays via Checkout link.
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: plan.stripe_price_id }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
    metadata: { coach_id: coachId },
  });

  // Stripe Checkout Session for the first payment
  const checkout = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customer.id,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/coach/customers?status=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/coach/customers/new?status=canceled`,
    subscription_data: { metadata: { coach_id: coachId } },
  });

  return { ok: true as const, checkoutUrl: checkout.url, customerId: customer.id };
}
```

`cancelSubscription`: takes a subscription UUID; verifies coach owns it; calls `stripe.subscriptions.update(stripe_id, { cancel_at_period_end: true })`. The webhook handler mirrors the state.

Fetchers:
- `listPayingCustomers()` joins `athletes + subscriptions + plans + payments`, returns `{ name, email, status, plan, mrr, lastPaidAt, ... }[]`.
- `listAthletePayments(athleteId)` returns rows ordered `paid_at desc`.
- `getCoachMRR()` returns `{ activeSubs, mrrCents, pastDueCount }`.
- `getCustomerPortalUrl()` athlete-side; `stripe.billingPortal.sessions.create({ customer: athlete.stripe_customer_id, return_url: ... })`.

Commit: `feat(billing): server actions + dashboard fetchers`.

### Task 6: Coach pages — list, new, detail

`app/coach/customers/page.tsx` (server):
- Header with count + "Onboard customer" CTA → `/coach/customers/new`.
- Table: name, plan, status, MRR contribution, last paid, "View" link.
- Empty state with CTA: "No paying customers yet. Onboard your first one."

`app/coach/customers/new/page.tsx` server shell + `new-customer-form.tsx` client form:
- Inputs: name, email, plan dropdown (fetch active plans).
- Submit calls `createPayingCustomer`. On success, render Checkout URL with copy button + email-link button (mailto with subject + body).

`app/coach/customers/[id]/page.tsx`:
- Customer summary: name, email, plan, status (active / past_due / canceled).
- Payment history table: date, amount, status, receipt link.
- "Cancel at period end" button (uses `<SubmitButton>` pattern from `components/submit-button.tsx`).
- If `status='past_due'`: rose-tinted alert with "go to Stripe dashboard" link.

Modify `app/coach/page.tsx`:
- Replace placeholder "Plan 8 — coming" card with real numbers via `getCoachMRR()`.
- Active subs / MRR ($X.XX/mo) / Failed (count, rose-tinted if > 0).
- The card is a Link to `/coach/customers`.

Commit: `feat(billing): coach customer onboarding + accounting pages`.

### Task 7: Athlete /app/billing page

`app/app/billing/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { listAthletePayments } from '@/lib/billing/list-payments';
import { getCustomerPortalUrl } from '@/lib/billing/get-customer-portal-url';

export const metadata = { title: 'Billing' };

export default async function BillingPage() {
  const athlete = await getCurrentAthlete();
  if (!athlete.stripe_customer_id) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-bone-muted">You don't have an active subscription. Reach out to William if you think this is a mistake.</p>
      </main>
    );
  }

  const payments = await listAthletePayments(athlete.id);
  const portalUrl = await getCustomerPortalUrl();

  return (
    // ... render plan summary + payment history + "Manage subscription" link to portalUrl
  );
}
```

Add a "Billing" link to `/app` layout nav (between Profile and Sign out).

Commit: `feat(billing): /app/billing athlete-facing billing page`.

### Task 8: Email templates (paid-invoice + payment-failed-internal) + tests

Vault aesthetic templates per spec §7. Variables substituted via the same simple `{{ var }}` template runner used for the request-received email.

`lib/email/templates/paid-invoice.ts`:

```ts
import { renderTemplate } from '@/lib/email/render';

type Vars = {
  athleteName: string;
  planName: string;
  amountFormatted: string; // "$200.00"
  paidAtFormatted: string; // "April 29, 2026"
  receiptUrl: string;
  nextPeriodEndFormatted: string;
};

export function paidInvoiceEmail(v: Vars) {
  return {
    subject: 'Receipt — Steele & Co. coaching',
    html: renderTemplate('paid-invoice.html', v),
    text:
      `Hi ${v.athleteName},\n\n` +
      `Your ${v.planName} subscription was charged ${v.amountFormatted} on ${v.paidAtFormatted}.\n\n` +
      `Receipt: ${v.receiptUrl}\n\n` +
      `Next charge: ${v.nextPeriodEndFormatted}\n\n` +
      `— Steele & Co.`,
  };
}
```

Same for `payment-failed-internal.ts` — short alert to William.

Unit tests: render template with sample vars, assert each var appears in output.

Commit: `feat(billing): branded paid-invoice + internal payment-failed emails`.

### Task 9: E2e — coach onboards customer, fixture invoice.paid, dashboard updates

`tests/e2e/billing/coach-onboards-customer.spec.ts`:

1. Sign in as coach via `/login`.
2. Navigate to `/coach/customers/new`. Fill name + email + plan. Submit.
3. Expect redirect to `/coach/customers?status=success` OR a copyable Checkout URL on the page.
4. Use a Supabase admin client to manually insert a `payments` row with status='paid' AND a `subscriptions` row with status='active' for that customer (simulates webhook arrival; bypasses needing a real Stripe CLI in the test runner).
5. Reload `/coach`. Assert the "Active subs" tile shows ≥ 1 and MRR > 0.
6. Sign in as that customer (re-use the email from step 2 → seed an athlete row + auth user).
7. Visit `/app/billing`. Assert the payment is listed.

Final gates: typecheck, lint, vitest, e2e. Push to origin/main.

Kill dev server before e2e if needed; restart after.

Commit: `test(billing): e2e for onboard-customer-then-paid flow + final gates`.

### Task 10: Production cutover docs (runbook)

Create `docs/superpowers/runbooks/2026-XX-XX-plan-8-stripe-rollout.md`:

1. Confirm Stripe live-mode KYC complete.
2. Create live-mode Product + Price in Stripe dashboard. Note `price_id`.
3. Set Vercel env: `STRIPE_SECRET_KEY` (live key), `STRIPE_WEBHOOK_SECRET` (after step 5), `STRIPE_PRICE_ID_BASE`, `STRIPE_PRICE_AMOUNT_CENTS`.
4. Deploy. Run `pnpm dlx tsx scripts/seed-plans.ts` against the live DB (one-time).
5. In Stripe dashboard → Webhooks → Add endpoint: `https://<live-domain>/api/webhooks/stripe`. Select events: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.created`. Copy the signing secret → set `STRIPE_WEBHOOK_SECRET` in Vercel → redeploy.
6. Smoke: in Stripe dashboard, create a test Customer + Subscription against a real coach-owned email. Confirm webhook delivers `customer.created` and a `payments` row appears in the live DB.
7. William invites his first paying customer through `/coach/customers/new`. Confirm:
   - Stripe Checkout link works.
   - Test card `4242 4242 4242 4242` charges successfully.
   - `invoice.paid` webhook fires, payment row inserted, paid-invoice email lands in client's inbox.
   - `/coach` MRR tile updates.

Commit: `docs(billing): plan 8 production rollout runbook`.

---

## Self-review

- All 30+ files at correct paths
- 10 commits per major chunk (or split per task — your call)
- Plan 7a public-profile pattern (server-derived slug, masked errors, RLS-via-helpers) reused
- Webhook handlers use service-role admin client; user-facing actions use the authed `createClient(...)` so RLS still gates user code paths
- All gates green
- Pushed to origin/main
- Production runbook written but NOT executed (William executes it manually after KYC clears)

## Known limitations (documented in spec, accepted for V1)

- Stripe Customer Portal handles cancellation UI; we don't build our own
- No coupon / trial / annual support
- No tax (Stripe Tax disabled)
- Refunds happen in Stripe dashboard; we record but don't initiate
- Single Stripe account (William's); multi-coach Connect deferred to V2
- Failed-payment email goes to William, not the client (Stripe dunning emails the client)

## Pre-flight checklist (before subagent dispatch)

- [ ] Stripe live account exists and KYC is complete
- [ ] At least one Product + Price exists in test mode
- [ ] `STRIPE_SECRET_KEY` (test) in `.env.local`
- [ ] `STRIPE_WEBHOOK_SECRET` (test) in `.env.local`
- [ ] `STRIPE_PRICE_ID_BASE` and `STRIPE_PRICE_AMOUNT_CENTS` in `.env.local`
- [ ] `pnpm add stripe` (Stripe Node SDK)
- [ ] Stripe CLI installed locally for `stripe listen` during Task 3 manual verification

Without these, Task 2 onward will fail. Stop and ask.
