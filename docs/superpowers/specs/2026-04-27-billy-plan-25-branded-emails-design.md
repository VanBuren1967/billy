# Plan 2.5 — Branded transactional emails via Resend

**Date:** 2026-04-27
**Status:** Design approved by user 2026-04-27. Implementation pending domain decision.
**Builds on:** Plan 2 (athlete onboarding & roster). Reuses the existing Resend account + API key already provisioned for the `request-received` confirmation email.

## Goal

Replace Supabase's default magic-link and invite emails with Vault-themed templates, and route Supabase auth email through Resend's SMTP relay so messages send from a verified Steele & Co. domain instead of `noreply@mail.app.supabase.io` (or, in dev sandbox, `onboarding@resend.dev`).

After this work, every email a prospect or athlete sees in V1 — whether they submitted a form, were invited by William, or signed in — looks like it came from Steele & Co. and lands in any inbox (not just `van@cfbcllc.com`, which is the current Resend sandbox restriction).

## Out of scope

- Other Supabase email templates (signup confirm, password reset, email change). V1 doesn't use those flows.
- Decline-reason capture / notification (separate Plan 2.5 follow-up).
- "Resend invite" button on the roster (separate follow-up; current workaround: re-use direct invite which is already idempotent).
- Captcha / rate-limit on `/request-to-join` (separate follow-up).
- Multi-coach branding (every coach gets their own templates). V1 has one coach; templates are hardcoded to "Steele & Co." for now. Multi-tenant template overrides come with multi-coach support.

## Architecture

Three components, each with one job:

- **Resend** — the actual mail-sending service. One account (Van's, already provisioned), one verified domain (TBD by William). Used for both transactional sends (Supabase auth emails routed via Resend's SMTP relay) and our own application sends (the existing `request-received` confirmation, sent via the Resend SDK from `lib/email/resend.ts`).
- **Supabase auth emails** — magic-link and invite. Currently rendered from gotrue's default HTML and routed through Inbucket in dev. After this work: rendered from Vault-themed HTML files we author at `supabase/templates/*.html`, routed through `smtp.resend.com:465` in production, still through Inbucket in dev.
- **Our own Resend sends** — the request-received confirmation. No code change. Already branded, already on Resend.

Local dev keeps using Inbucket; nothing about local changes except that Inbucket now displays our branded HTML instead of Supabase's defaults. Production uses Resend SMTP. The dev/prod switch lives entirely in `supabase/config.toml` (`[auth.email.smtp]` block, only enabled when `SUPABASE_AUTH_SMTP_HOST` env var is set), so the same config file works in both environments.

## Components

### `supabase/config.toml`

Add or modify these blocks:

```toml
[auth.email.smtp]
enabled = true
host = "env(SUPABASE_AUTH_SMTP_HOST)"
port = 465
user = "env(SUPABASE_AUTH_SMTP_USER)"
pass = "env(SUPABASE_AUTH_SMTP_PASS)"
admin_email = "noreply@<TBD-DOMAIN>"
sender_name = "Steele & Co."

[auth.email.template.invite]
subject = "You're invited to Steele & Co."
content_path = "./supabase/templates/invite.html"

[auth.email.template.magic_link]
subject = "Your Steele & Co. sign-in link"
content_path = "./supabase/templates/magic-link.html"
```

When `SUPABASE_AUTH_SMTP_HOST` is unset (local dev), Supabase falls back to Inbucket per its usual local behavior. When set (CI / production via Vercel), it routes via Resend.

### `supabase/templates/invite.html`

New. Vault aesthetic (rich black, warm bone text, gold accent, serif headline, sans body). Variables:

- `{{ .ConfirmationURL }}` — the magic-link URL Supabase generates.
- `{{ .Email }}` — recipient.
- `{{ .Data.name }}` — the athlete's name, passed via `inviteUserByEmail(email, {data: {name}})` in `inviteAthlete` (already passed today).

Subject (set in config.toml): "You're invited to Steele & Co."

### `supabase/templates/magic-link.html`

New. Same aesthetic. Variables: `{{ .ConfirmationURL }}`, `{{ .Email }}`. No `Data.name` — the magic-link flow is initiated by the user themselves so we don't address them by name.

Subject: "Your Steele & Co. sign-in link".

### `.env.example` and `.env.local`

Add three new variables:

```
SUPABASE_AUTH_SMTP_HOST=smtp.resend.com
SUPABASE_AUTH_SMTP_USER=resend
SUPABASE_AUTH_SMTP_PASS=re_<the existing Resend API key>
```

In `.env.example`, all three are commented out / empty so local dev defaults to Inbucket. In `.env.local` and Vercel env, only set them when ready to test the Resend route.

The existing `RESEND_API_KEY` and `RESEND_FROM_EMAIL` env vars (used by `lib/email/resend.ts` for the request-received confirmation) stay as-is. `RESEND_FROM_EMAIL` will switch from `onboarding@resend.dev` to `noreply@<domain>` once the domain is verified, so the request-received confirmation email matches the auth emails.

### `app/dev/email-preview/page.tsx`

New dev-only route. Renders all three templates side-by-side in iframes for visual QA. Implementation:

- The page is a server component that reads the two HTML template files from `supabase/templates/*.html` at request time and inlines them into iframes via `srcdoc`. The third iframe shows the existing `request-received` template by calling our `requestReceivedEmail()` helper directly.
- Substitutes placeholders with sample values: `{{ .ConfirmationURL }}` → `https://example.com/sample-link`, `{{ .Email }}` → `prospect@example.com`, `{{ .Data.name }}` → `Sample Athlete`.
- Returns 404 if `process.env.NODE_ENV === 'production'` so the route is not reachable in prod.

Layout: three iframes stacked vertically with a small heading above each ("Invite", "Magic link", "Request received"). Each iframe is `min-h-[600px]` with the page-level dark background visible around them so the preview matches a real email client preview pane.

### DNS records

Three CNAMEs at `<TBD-DOMAIN>` for SPF, DKIM, and DMARC. Resend's domain dashboard generates the exact values when the domain is added. Whoever owns the domain (Van or William) sets these once. After verification (typically 5-30 min), Resend marks the domain green and Plan 2.5 can ship.

### Resend dashboard

Manual step, blocking on William: add the chosen domain in Resend → Domains → Add Domain → wait for DNS propagation → confirm "Verified" status.

## Data flow

Three runtime paths, all unchanged at the application layer; only the SMTP transport changes.

### Magic-link sign-in

1. User submits `/login` form.
2. `sendMagicLink` server action calls `supabase.auth.signInWithOtp({email, options:{emailRedirectTo}})`.
3. gotrue picks `magic-link.html`, substitutes `{{ .ConfirmationURL }}` and `{{ .Email }}`, hands the rendered HTML to its SMTP layer.
4. SMTP layer reads `[auth.email.smtp]` config:
   - **Dev (vars unset):** falls back to Inbucket (`http://localhost:54324`).
   - **Prod (vars set):** opens TLS connection to `smtp.resend.com:465`, authenticates with `resend` / `<api-key>`, sends.
5. Resend delivers from `Steele & Co. <noreply@<domain>>` to recipient.

### Coach approves a join request

1. Coach clicks "Approve & invite" on `/coach/requests`.
2. `approveJoinRequest` action calls `inviteAthlete`.
3. `inviteAthlete` calls `admin.auth.admin.inviteUserByEmail(email, {redirectTo, data:{athlete_id, coach_id, name}})`.
4. gotrue picks `invite.html`, substitutes `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .Data.name }}` → SMTP layer → Resend / Inbucket as above.
5. Existing duplicate-email branch in `inviteAthlete` (linking to existing auth user, no email) is unaffected.

### Public form confirmation

1. Prospect submits `/request-to-join` form.
2. `submitJoinRequest` action calls `sendEmail` from `lib/email/resend.ts`.
3. Resend SDK posts to Resend's API directly. No SMTP, no Supabase involvement. (Same path as today.)
4. Once `RESEND_FROM_EMAIL` is updated from `onboarding@resend.dev` to `noreply@<domain>`, the From header matches the auth emails for visual consistency.

## Testing & rollout

### Local

- **Unit / integration / e2e tests** — no new tests required, no existing tests need to change. Application code paths are identical; only the SMTP transport underneath changes, which is already mocked or routed to Inbucket in tests.
- **Visual QA** — open `/dev/email-preview` in a browser. Inspect all three templates rendered side-by-side. Resize the window, test light-mode email clients (some clients force a light background even on dark-styled HTML; the templates should degrade gracefully).
- **Local smoke** — submit `/login`, submit `/request-to-join`, approve via `/coach/requests`. Open Inbucket. Confirm the rendered emails are Vault-branded, not Supabase-default. (`request-received` already passes; the new templates are what we're verifying.)

### Production rollout

After William picks the domain and updates DNS:

1. Add domain in Resend dashboard. Confirm verification.
2. Set `SUPABASE_AUTH_SMTP_HOST`, `SUPABASE_AUTH_SMTP_USER`, `SUPABASE_AUTH_SMTP_PASS`, and update `RESEND_FROM_EMAIL` in Vercel project env.
3. Push `supabase/config.toml` + `supabase/templates/*.html` to the remote (linked) Supabase project. The implementation plan covers two paths and picks the right one based on the project's link state at execution time:
   - If the project is linked (`supabase link --project-ref <ref>`), run `supabase config push` (config-only, no migrations) to sync the SMTP block + template references.
   - If not yet linked, `supabase link` first, then `config push`. Templates are bundled because `content_path` references are relative paths the Supabase CLI uploads alongside the config.
4. Send one real test email of each type to `van@cfbcllc.com`:
   - Magic-link: hit prod `/login`, type `van@cfbcllc.com`, submit.
   - Invite: prod coach approves a fresh request from a test prospect.
   - Request-received: prod public form submission.
5. Verify From header, body styling, link click-through. Watch Resend dashboard for delivery, bounce, and spam-flag rates over the first 24 hours.

## Open items pending William

- **Domain** — `mail.cfbcllc.com` (if Van owns and provides), `mail.steele-co.com` (if William registers Steele-branded), or another. Determines DNS responsibility and From header.
- **From name** — defaulting to `Steele & Co.`. Alternative: `William Steele`, or `William @ Steele & Co.`. Confirm with William.
- **Reply-to** — defaulting to none (replies bounce). If William wants prospect replies routed to his inbox, set `[auth.email.smtp]` `admin_email` to a real address (not `noreply@`).

These can all be filled in via env vars / config without code changes once William decides.

## Risks & mitigations

- **Resend free tier (3,000 emails/month, 100/day)** — fine for V1 (~handful of invites/day). Plan 3+ might exceed if athlete check-in notifications fan out; revisit then.
- **DNS propagation delay** — typically 5-30 min, occasionally hours. Not blocking for code work; only blocks the prod-rollout cutover step.
- **SPF/DKIM misconfiguration → spam folder** — caught by Resend's verification check (won't go green if records are wrong). Production smoke test (step 4 above) confirms inbox placement.
- **Template variables not rendering** — caught by visual QA on `/dev/email-preview` and by local smoke before prod cutover.
- **Inbucket fails on the new HTML** — unlikely (Inbucket renders any HTML), but verifiable in local smoke.
