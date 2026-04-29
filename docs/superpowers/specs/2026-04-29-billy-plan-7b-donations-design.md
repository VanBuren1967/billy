# Plan 7b — Youth team donations + thank-you + monthly newsletter

**Date:** 2026-04-29
**Status:** Design draft. Refines the original "Plan 7b donations" stub from the V1 spec based on William's feedback (2026-04-29: "donations are for the youth team going to nationals; donor gets a thank-you and is auto-added to a monthly team-update list").
**Builds on:** Plan 7a (public profiles + `/team` pages), Plan 2.5 (Resend), Plan 8 (Stripe SDK + webhook plumbing).

## Goal

Visitors to William's public `/team` and `/team/[slug]` pages can donate to the Steele & Co. youth powerlifting team via a simple Stripe Checkout flow. After a successful charge, the donor receives a branded thank-you email and is silently subscribed to a monthly team-update newsletter that William sends out (V1: list export Van runs by hand; V1.5: automated digest). The coach dashboard shows total raised, this month, and donor count — replacing the placeholder card already on `/coach`.

This is a **secondary revenue stream** distinct from coaching subscriptions (Plan 8). Donations are tax-deductible-ish gifts to support the team's travel + meet entries; they are NOT services rendered.

## Out of scope

- 501(c)(3) / tax-receipt language. The team is not (yet) a registered nonprofit; the thank-you email says "donation" not "tax-deductible donation". William's accountant decides if/when to file 990s.
- Recurring donations. V1 is one-time only. (V1.5 may add monthly giving.)
- Donor-pick-an-athlete fundraising thermometer ("$X of $Y for Alex's nationals trip"). Donations go to the team, not individuals.
- Multi-team or multi-cause routing. Single team account.
- Public donor wall / leaderboard. V1 is private; V1.5 may add opt-in public recognition.
- Apple Pay / Google Pay button on the public page (Stripe Checkout already supports both inside its hosted page; we don't need a separate inline button for V1).
- Newsletter editor UI inside the app. V1: William writes the newsletter externally (Substack, Mailchimp, or just Gmail BCC) using a list Van exports; V1.5 builds an in-app composer.

## Architecture

Three components:

- **Stripe Checkout (one-time payment mode)** — money movement. Reuses the same Stripe account as Plan 8. New Product = "Youth team donation"; price is `custom_unit_amount` so the donor enters their own amount. Goes to William's main Stripe balance (NOT Connect — Connect was suggested in earlier notes but is overkill since the team and the coaching business share William's bank). Accountant separates the books on William's end.
- **Our `donations` + `newsletter_subscribers` tables** — local mirror. Same pattern as Plan 8 payments: webhook-driven, service-role inserts, RLS-scoped reads.
- **Resend** — sends the thank-you email. Branded template at `supabase/templates/donation-thank-you.html`.

Newsletter is a list, not a system. The `newsletter_subscribers` table is just rows of email + name + opt-in source (donation, signup form, ...) + unsubscribe token. V1 sending is manual; V1.5 builds the cron.

## Decisions

| Decision | Value | Why |
|---|---|---|
| Stripe product | Stripe Checkout one-time, NOT Connect | Single team account; William's accountant separates the ledgers. Connect adds onboarding friction with no offsetting benefit. |
| Donation amounts | Three preset buttons ($25 / $50 / $100) + custom amount input ($1 min, $10000 max) | Industry standard. Easy to scan; flexible. |
| Donation page URL | `/team/donate` (single page; not per-athlete) | William wants donations to support the team, not individual athletes. Keeps the messaging "youth team going to nationals". Per-athlete tipping can come later. |
| Donor ↔ user link | Donations carry email + name only. We do NOT auto-create a Supabase auth user. Donors can be totally anonymous to our auth system. | Friction-free giving. |
| Thank-you email | Sent on `checkout.session.completed` webhook. Branded, signed "William Steele, Steele & Co.", includes the donation amount + transaction date. | Personal. Lands in any inbox per Plan 2.5. |
| Newsletter signup | Auto on donation (with a checkbox on the Checkout success page that defaults checked: "Keep me updated with monthly team news. You can unsubscribe anytime."). Donor can uncheck. | Opt-in by default but easy out. Compliant-ish (CAN-SPAM allows opt-out; GDPR is stricter — we add a one-click unsubscribe in every email). |
| Newsletter unsubscribe | Token-based one-click link in every email footer (`/newsletter/unsubscribe?token=...`). No login required. | Standard. CAN-SPAM compliant. |
| Coach dashboard numbers | Replace the "Plan 7b — coming" card with: total raised (sum of paid donations all-time), this month (current calendar month), donors (count of distinct donor emails ever) | Matches what the placeholder already showed. |
| Privacy on /team/[slug] | Donation button visible on individual athlete pages too, but it goes to the same `/team/donate` page (not earmarked). | Athletes feel supported; books stay simple. |
| Anonymous donation flag | Donor can check "Display my donation as anonymous". Doesn't affect storage; only affects the (V1.5) public donor wall. | Future-proofing the schema; storing the bit costs nothing. |
| Failed donations | Stripe Checkout shows its own failure UI; we do nothing extra. No row inserted unless `checkout.session.completed` fires. | Don't pollute the `donations` table with abandoned-cart noise. |
| Refund handling | Webhook on `charge.refunded` updates the donation row to `status='refunded'`; no email. Coach sees it on dashboard. | Refunds happen via Stripe dashboard; we just record. |
| Tax reporting | None for V1. William's accountant pulls the Stripe report. | Out of scope. |

## Schema changes

Migration `0016_donations_and_newsletter.sql`:

```sql
create table public.donations (
  id uuid primary key default gen_random_uuid(),
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text not null unique,
  stripe_event_id text not null unique,
  donor_email text not null,
  donor_name text not null,
  amount_cents integer not null check (amount_cents > 0),
  status text not null check (status in ('paid','refunded')),
  display_anonymous boolean not null default false,
  paid_at timestamptz not null,
  refunded_at timestamptz,
  receipt_url text,
  created_at timestamptz not null default now()
);
create index donations_paid_at_idx on public.donations(paid_at desc);
create index donations_donor_email_idx on public.donations(donor_email);

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  opted_in_at timestamptz not null default now(),
  opt_in_source text not null check (opt_in_source in ('donation','manual','public_form')),
  unsubscribe_token text not null unique default encode(gen_random_bytes(24), 'base64'),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);
create index newsletter_active_idx on public.newsletter_subscribers(unsubscribed_at) where unsubscribed_at is null;

-- RLS
alter table public.donations enable row level security;
alter table public.newsletter_subscribers enable row level security;

-- Donations: only coaches read (and only their own scope — but V1 is single-coach; SELECT for any coach is fine)
create policy app_donations_coach_select on public.donations
  for select using (public.auth_coach_id() is not null);
-- INSERT/UPDATE only via service-role (webhook).

-- Newsletter subscribers: only coaches can SELECT for export. Public unsubscribe via service-role route handler with token.
create policy app_newsletter_coach_select on public.newsletter_subscribers
  for select using (public.auth_coach_id() is not null);
```

## Page map

| Route | Auth | Purpose |
|---|---|---|
| `/team/donate` | public | Donation form (amount + email + name + anonymous? + newsletter? + Donate button) → creates Stripe Checkout Session, redirects to Stripe |
| `/team/donate/success` | public | Stripe success redirect lands here; shows "Thank you!" + confirms newsletter signup state |
| `/team/donate/canceled` | public | Stripe cancel redirect; shows "No charge made — try again?" |
| `/newsletter/unsubscribe` | public | Token-keyed unsubscribe page; one-click confirmation |
| `/coach/donations` | coach | List of all donations — date, donor, amount, anonymous flag, status — plus a "Export newsletter list (CSV)" button |
| `/api/webhooks/stripe` | (existing from Plan 8) | Adds dispatch for `checkout.session.completed` and `charge.refunded` events |

Modify `/coach` dashboard: replace the "Plan 7b — coming" placeholder card with real numbers from `getDonationStats()`.

Modify `/team/page.tsx` and `/team/[slug]/page.tsx`: add a prominent "Support the team" CTA → `/team/donate`.

## Server actions / route handlers

| Function | Purpose |
|---|---|
| `lib/donations/actions/create-checkout.ts` `createDonationCheckout(input)` | Public. Validates input, creates Stripe Checkout Session in `payment` mode with `custom_unit_amount`, returns the URL for redirect. Stores the newsletter-opt-in flag in session metadata. |
| `lib/donations/list-donations.ts` `listDonations()` | Coach dashboard fetcher. |
| `lib/donations/get-stats.ts` `getDonationStats()` | Returns `{ totalCents, thisMonthCents, donorCount }` for the dashboard. |
| `lib/donations/webhook-handlers/checkout-completed.ts` | Idempotent. Inserts donation row, sends thank-you email, conditionally inserts newsletter_subscribers row (skip if email already exists). |
| `lib/donations/webhook-handlers/charge-refunded.ts` | Idempotent. Updates donation row status. |
| `lib/newsletter/actions/unsubscribe.ts` `unsubscribeByToken(token)` | Public. Marks `unsubscribed_at = now()`. Idempotent (already unsubscribed = success). |
| `lib/newsletter/export-list.ts` `exportNewsletterCSV()` | Coach-only. Returns CSV: email, name, opted_in_at, opt_in_source. Used by the "Export" button on `/coach/donations`. |

## Validation

```ts
export const createDonationSchema = z.object({
  amountCents: z.number().int().min(100).max(1_000_000), // $1 to $10000
  donorEmail: z.string().email().max(254),
  donorName: z.string().min(1).max(120),
  displayAnonymous: z.boolean().default(false),
  newsletterOptIn: z.boolean().default(true),
});
```

## Email template

`supabase/templates/donation-thank-you.html` — Vault aesthetic, warmer / more personal than the receipt template. Variables: `{{ donor_name }}`, `{{ amount_formatted }}`, `{{ paid_at_formatted }}`, `{{ receipt_url }}`, `{{ unsubscribe_url }}` (only included if newsletter_opted_in).

Subject: `Thank you, {{ donor_name }} — Steele & Co. youth team`.

Footer (on every email going to a newsletter subscriber): "You're getting this because you donated to the Steele & Co. youth team. [Unsubscribe with one click]({{ unsubscribe_url }})."

## Tests

- **Unit:** Zod schema. Token generation uniqueness. Idempotency keys.
- **Integration:** RLS — coaches read donations + newsletter; athletes/anon cannot. Webhook idempotency. Newsletter opt-out is one-click (no auth).
- **E2e:** Public donate flow with Stripe CLI fixture event — fake checkout completes, donation row inserted, dashboard reflects it, thank-you email lands in Inbucket. Then click the unsubscribe link, verify newsletter row is unsubscribed, confirm dashboard `donorCount` does NOT decrease (donation history is preserved separately).

## Edge cases

| Case | Handling |
|---|---|
| Donor donates twice with same email | Two donation rows; one newsletter subscriber row (unique email — upsert). Both donations counted. |
| Donor unchecks newsletter then donates | No newsletter_subscribers row inserted. Donation row created normally. |
| Donor was already unsubscribed, then donates again with newsletter checked | Re-subscribe (clear `unsubscribed_at`). Update opt_in_source if relevant. |
| Donor enters invalid amount in custom field | Stripe Checkout validates per `custom_unit_amount.min/max`; we also validate server-side via Zod. |
| Webhook arrives before redirect to /success | Race is fine; success page just reads the donation row by session_id (or shows generic thanks even if not yet present). |
| Donor refunds outside our system | `charge.refunded` webhook → row updated → dashboard total adjusts. |
| Newsletter token leaked / brute-forced | 24 random bytes (192 bits); collision/guess astronomically unlikely. Even if guessed, only effect is one-click unsubscribe — no PII exposure. |
| Anonymous flag but William wants to thank them privately | Anonymous flag is display-only; coach view still shows email + name. |

## V1.5+ followups

- Recurring monthly donations (Stripe subscription mode for donations)
- Public donor wall / leaderboard with opt-in
- Per-meet fundraising goals (thermometer)
- In-app newsletter composer + send (with `newsletter_campaigns` table)
- Tax-deductible language once 501(c)(3) status is filed
- Apple Pay / Google Pay express button inline on /team/donate (in addition to the version Stripe Checkout already shows)
- Donor-named athletes ("This donation honors Alex Reyes")

## Prerequisites William must complete before implementation can start

1. **Stripe account live** (same prerequisite as Plan 8). If Plan 8 ships first, this is already satisfied.
2. **Decide donation language tone**: "Donate to the team" vs. "Support the youth program" vs. "Sponsor a meet". Affects copy on `/team/donate`.
3. **Confirm the email address** that signs the thank-you email (e.g., "William Steele, Head Coach, Steele & Co." with a reply-to of `william@steele-co.com`).
4. **Decide on suggested amounts** (default proposal: $25 / $50 / $100). William may want different defaults based on typical donor capacity.
5. **Confirm that V1 newsletter delivery is manual** (Van exports CSV, William sends from his email or Substack). V1.5 will automate, but only after V1 is producing real donor traffic.

## Sequencing relative to Plan 8

Plan 8 ships first (paying customers — primary revenue). Plan 7b reuses Plan 8's Stripe SDK setup, webhook route handler scaffolding, and Resend-based email send infrastructure. Plan 7b is roughly half the work of Plan 8 because subscriptions/dunning/portal logic don't apply.

Estimate: 1.5-2 days of focused work after Plan 8.

## Next step

User reviews this spec → approve → write implementation plan → execute via subagent-driven development.
