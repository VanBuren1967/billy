# Plan 2.5 — Branded transactional emails via Resend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase's default magic-link and invite emails with Vault-themed templates, and produce a runbook for routing Supabase auth email through Resend's SMTP relay so production messages send from a verified Steele & Co. domain.

**Architecture:** Templates live in `supabase/templates/*.html` and are referenced from `supabase/config.toml` under `[auth.email.template.*]` blocks. Local dev keeps using Inbucket (no Resend hop, no quota burn); production routes via Resend SMTP, configured one-time via the Supabase Dashboard (since config.toml's `env()` substitution doesn't reliably gate the SMTP `enabled` flag). A new dev-only `/dev/email-preview` route renders all three of our templates side-by-side for visual QA without sending anything.

**Tech Stack:** Supabase (gotrue email templates with `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`, `{{ .Data.* }}` Go template variables), Next.js 16 App Router (server components, `notFound()` gate), Resend (SMTP relay for prod, SDK for application-level sends). No new npm dependencies.

**Spec reference:** `docs/superpowers/specs/2026-04-27-billy-plan-25-branded-emails-design.md`.

**Working directory for all commands:** `C:\Users\van\Desktop\billy` (use forward slashes in bash). All `pnpm`/`supabase` commands run from the repo root unless noted.

**Builds on:** Plan 2 (athlete onboarding & roster). Reuses the existing Resend account + API key already provisioned in `.env.local` for the `request-received` email.

---

## Out of scope (deferred to later plans)

- Other Supabase email templates (signup confirm, password reset, email change). V1 doesn't use those flows.
- Decline-reason capture / email notification.
- "Resend invite" button on the roster.
- Captcha / rate-limit on `/request-to-join`.
- Multi-coach branded templates (every coach with own copy). V1 is single-tenant; templates are hardcoded "Steele & Co.".

---

## File map (Plan 2.5)

| Path | Purpose |
|---|---|
| `supabase/templates/invite.html` | New. Vault-themed coach-invite email body. |
| `supabase/templates/magic-link.html` | New. Vault-themed sign-in email body. |
| `supabase/config.toml` | Modify. Uncomment + populate `[auth.email.template.invite]`; add new `[auth.email.template.magic_link]` block. |
| `.env.example` | Modify. Inline-comment guidance on prod swap of `RESEND_FROM_EMAIL`. |
| `app/dev/email-preview/page.tsx` | New. Dev-only route renders all three templates in iframes. |
| `docs/superpowers/runbooks/2026-04-27-plan-25-resend-rollout.md` | New. Step-by-step prod cutover runbook (Resend domain, DNS, Supabase Dashboard SMTP, Vercel env). |

---

## Pre-flight (ONCE, before Task 1)

- [ ] **PF-1.** Confirm local Supabase is running and the working tree is clean:

```bash
pnpm exec supabase status
```

Expected: `API URL`, `DB URL`, `Studio URL`, `Inbucket URL` all reported.

```bash
git status --short
```

Expected: clean. (`.claude/` and `shell.cmd` show as untracked — that's expected; both are gitignored.)

- [ ] **PF-2.** Confirm existing tests still pass before changing anything:

```bash
pnpm typecheck && pnpm test
```

Expected: typecheck passes, 23/23 unit/integration tests pass.

---

## Task 1: Create the invite email template

**Files:**
- Create: `supabase/templates/invite.html`

This template renders when a coach approves a join request → `inviteAthlete` calls `admin.auth.admin.inviteUserByEmail(email, {redirectTo, data:{athlete_id, coach_id, name}})`. gotrue substitutes `{{ .ConfirmationURL }}` with the verify URL, `{{ .Email }}` with the recipient, and `{{ .Data.name }}` with the name we passed via `data`.

- [ ] **Step 1: Create the template**

Create `supabase/templates/invite.html`:

```html
<!doctype html>
<html>
  <body style="margin:0;padding:32px;background:#080808;font-family:Georgia,serif;color:#f4f0e8;">
    <div style="max-width:560px;margin:0 auto;">
      <p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#c9a14c;margin:0 0 16px;">Steele &amp; Co.</p>
      <h1 style="font-size:28px;margin:0 0 24px;font-weight:normal;line-height:1.2;">You&rsquo;ve been <em style="color:#c9a14c;font-style:italic;">invited</em>.</h1>
      <p style="line-height:1.6;color:#a39d8a;margin:0 0 16px;">Hi {{ .Data.name }},</p>
      <p style="line-height:1.6;color:#a39d8a;margin:0 0 24px;">
        William Steele has invited you to join Steele &amp; Co. &mdash; a private coaching platform for competitive powerlifters. Click below to sign in and complete your athlete profile.
      </p>
      <p style="margin:0 0 24px;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;border:1px solid #c9a14c;color:#c9a14c;padding:14px 28px;text-decoration:none;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">Accept invitation</a>
      </p>
      <p style="line-height:1.6;color:#6a6457;font-size:13px;margin:0 0 8px;">
        Or paste this code at the sign-in screen:
      </p>
      <p style="font-family:ui-monospace,Menlo,monospace;font-size:18px;letter-spacing:0.3em;color:#f4f0e8;margin:0 0 32px;">{{ .Token }}</p>
      <hr style="border:none;border-top:1px solid #1a1814;margin:32px 0;"/>
      <p style="font-size:11px;letter-spacing:0.05em;color:#6a6457;margin:0;">
        This link expires in 1 hour. If you weren&rsquo;t expecting this invite, ignore the message.
      </p>
    </div>
  </body>
</html>
```

- [ ] **Step 2: Visual sanity check**

Open `supabase/templates/invite.html` directly in a browser (drag the file into a Chrome window, or `start supabase\templates\invite.html` on Windows). Expected: the email renders with black background, gold accent eyebrow, off-white body text, gold-bordered "Accept invitation" button. The Go template variables (`{{ .Data.name }}`, `{{ .ConfirmationURL }}`, `{{ .Token }}`) appear as literal text since no substitution happens here — that's fine for sanity.

- [ ] **Step 3: Commit**

```bash
git add supabase/templates/invite.html
git commit -m "feat(email): vault-themed invite template"
```

---

## Task 2: Create the magic-link email template

**Files:**
- Create: `supabase/templates/magic-link.html`

This template renders when a user submits the `/login` form → `signInWithOtp` → gotrue. Variables: `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`. No `Data.name` (the magic-link flow has no user metadata payload).

- [ ] **Step 1: Create the template**

Create `supabase/templates/magic-link.html`:

```html
<!doctype html>
<html>
  <body style="margin:0;padding:32px;background:#080808;font-family:Georgia,serif;color:#f4f0e8;">
    <div style="max-width:560px;margin:0 auto;">
      <p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#c9a14c;margin:0 0 16px;">Steele &amp; Co.</p>
      <h1 style="font-size:28px;margin:0 0 24px;font-weight:normal;line-height:1.2;">Your <em style="color:#c9a14c;font-style:italic;">sign-in link</em>.</h1>
      <p style="line-height:1.6;color:#a39d8a;margin:0 0 24px;">
        Click below to sign in to {{ .Email }}. The link expires in 1 hour.
      </p>
      <p style="margin:0 0 24px;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;border:1px solid #c9a14c;color:#c9a14c;padding:14px 28px;text-decoration:none;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">Sign in</a>
      </p>
      <p style="line-height:1.6;color:#6a6457;font-size:13px;margin:0 0 8px;">
        Or paste this code at the sign-in screen:
      </p>
      <p style="font-family:ui-monospace,Menlo,monospace;font-size:18px;letter-spacing:0.3em;color:#f4f0e8;margin:0 0 32px;">{{ .Token }}</p>
      <hr style="border:none;border-top:1px solid #1a1814;margin:32px 0;"/>
      <p style="font-size:11px;letter-spacing:0.05em;color:#6a6457;margin:0;">
        If you didn&rsquo;t request a sign-in link, ignore this message. Replies aren&rsquo;t monitored.
      </p>
    </div>
  </body>
</html>
```

- [ ] **Step 2: Visual sanity check**

Open `supabase/templates/magic-link.html` directly in a browser. Expected: same Vault aesthetic as `invite.html`, headline reads "Your sign-in link." with "sign-in link" italicized in gold. Variables show as literal text.

- [ ] **Step 3: Commit**

```bash
git add supabase/templates/magic-link.html
git commit -m "feat(email): vault-themed magic-link template"
```

---

## Task 3: Wire templates into supabase/config.toml

**Files:**
- Modify: `supabase/config.toml`

Currently lines 147-150 of `config.toml` have commented-out scaffolding for an invite template. We uncomment and populate it, plus add a new block for magic-link.

- [ ] **Step 1: Edit `supabase/config.toml`**

Find the block (around line 147) that reads:

```toml
# Uncomment to customize email template
# [auth.email.template.invite]
# subject = "You have been invited"
# content_path = "./supabase/templates/invite.html"
```

Replace it with:

```toml
# Customize email templates. Local dev renders these via Inbucket; production
# renders via the Supabase Dashboard's configured SMTP (set up per the Plan 2.5
# rollout runbook). Both environments use the same templates.
[auth.email.template.invite]
subject = "You're invited to Steele & Co."
content_path = "./supabase/templates/invite.html"

[auth.email.template.magic_link]
subject = "Your Steele & Co. sign-in link"
content_path = "./supabase/templates/magic-link.html"
```

- [ ] **Step 2: Restart local Supabase to pick up the new template config**

```bash
pnpm exec supabase stop
pnpm exec supabase start
```

Expected: container restarts cleanly. `pnpm exec supabase status` reports all services up.

- [ ] **Step 3: Verify the templates load**

Trigger a magic-link send by hitting the local Supabase auth REST endpoint directly (no Next dev server needed). Replace `<TS>` below with the output of `date +%s` so the email is unique each run:

```bash
ANON=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2)
EMAIL="template-check-$(date +%s)@example.com"
curl -s -X POST "http://127.0.0.1:54321/auth/v1/otp" \
  -H "apikey: $ANON" \
  -H "content-type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"create_user\":true}" \
  -o /dev/null -w "otp request: HTTP %{http_code}\n"
```

Expected: `otp request: HTTP 200`.

Now poll Inbucket for the email. The mailbox is the part before `@`:

```bash
MAILBOX="${EMAIL%@*}"
sleep 1
curl -s "http://localhost:54324/api/v1/mailbox/$MAILBOX" \
  | python -c "import json,sys;d=json.load(sys.stdin);print(d[-1]['subject'] if d else 'NO MESSAGES')"
```

Expected: `Your Steele & Co. sign-in link`.

If subject is "Your Magic Link" (Supabase default) or `NO MESSAGES`, the template didn't load — verify `content_path` is relative to repo root (`./supabase/templates/...`) and that Supabase was restarted after the config.toml edit.

Now confirm the body is the Vault HTML, not the default plaintext:

```bash
ID=$(curl -s "http://localhost:54324/api/v1/mailbox/$MAILBOX" | python -c "import json,sys;d=json.load(sys.stdin);print(d[-1]['id'])")
curl -s "http://localhost:54324/api/v1/mailbox/$MAILBOX/$ID" \
  | python -c "import json,sys;b=json.load(sys.stdin)['body'];html=b.get('html','');print('vault-themed:', 'YES' if ('#c9a14c' in html and 'sign-in link' in html) else 'NO')"
```

Expected: `vault-themed: YES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/config.toml
git commit -m "feat(email): point supabase auth at vault-themed templates"
```

---

## Task 4: Document the prod swap of RESEND_FROM_EMAIL in .env.example

**Files:**
- Modify: `.env.example`

The application-level `request-received` confirmation email already runs through Resend via `lib/email/resend.ts`. Currently `RESEND_FROM_EMAIL=onboarding@resend.dev` (sandbox). When the verified domain lands, this needs to swap to `noreply@<domain>` so the request-received confirmation matches the auth emails (which will route through the same domain via the Dashboard SMTP config).

No code changes — `lib/email/resend.ts` already reads from env. We just document the swap in `.env.example` so future-me / a teammate knows.

- [ ] **Step 1: Edit `.env.example`**

Find the existing block:

```bash
# Resend (transactional email)
RESEND_API_KEY=
# Use onboarding@resend.dev locally; switch to a verified domain sender in prod.
RESEND_FROM_EMAIL=onboarding@resend.dev
```

Replace it with:

```bash
# Resend (transactional email)
# Send-side credentials, used by lib/email/resend.ts for the request-received
# confirmation email. Supabase auth emails (magic-link, invite) route through
# Resend's SMTP relay separately, configured in the Supabase Dashboard.
RESEND_API_KEY=
# Local dev uses the Resend sandbox sender. Production swaps to a verified
# domain — e.g., RESEND_FROM_EMAIL=noreply@mail.cfbcllc.com — once the domain
# is verified per docs/superpowers/runbooks/2026-04-27-plan-25-resend-rollout.md.
RESEND_FROM_EMAIL=onboarding@resend.dev
```

- [ ] **Step 2: Verify env loading still works**

```bash
pnpm typecheck && pnpm test
```

Expected: passes. (We didn't change runtime behavior.)

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs(env): document RESEND_FROM_EMAIL prod swap target"
```

---

## Task 5: Build the dev-only `/dev/email-preview` page

**Files:**
- Create: `app/dev/email-preview/page.tsx`
- Modify: `proxy.ts` (add `/dev/` to public paths so the preview page is reachable without sign-in)

This page renders all three of our templates side-by-side in iframes for visual QA. It reads the two HTML files at request time, substitutes preview values for the Go-template variables, and inlines them via `srcdoc`. The third iframe shows the existing `request-received` template by calling `requestReceivedEmail()` directly.

- [ ] **Step 1: Update `proxy.ts` to make `/dev/*` public**

Find the `isPublic()` function (around line 23):

```ts
function isPublic(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/request-to-join/')
  );
}
```

Add a `/dev/` prefix check:

```ts
function isPublic(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/request-to-join/') ||
    pathname.startsWith('/dev/')
  );
}
```

- [ ] **Step 2: Create the preview page**

Create `app/dev/email-preview/page.tsx`:

```tsx
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { notFound } from 'next/navigation';
import { requestReceivedEmail } from '@/lib/email/templates/request-received';

export const metadata = { title: 'Email preview (dev)' };

const SAMPLE_CONFIRMATION_URL = 'https://example.com/auth/v1/verify?token=sample';
const SAMPLE_TOKEN = '123456';
const SAMPLE_EMAIL = 'prospect@example.com';
const SAMPLE_NAME = 'Sample Athlete';

function renderTemplate(filename: string): string {
  const html = readFileSync(
    join(process.cwd(), 'supabase', 'templates', filename),
    'utf8',
  );
  return html
    .replace(/\{\{\s*\.ConfirmationURL\s*\}\}/g, SAMPLE_CONFIRMATION_URL)
    .replace(/\{\{\s*\.Token\s*\}\}/g, SAMPLE_TOKEN)
    .replace(/\{\{\s*\.Email\s*\}\}/g, SAMPLE_EMAIL)
    .replace(/\{\{\s*\.Data\.name\s*\}\}/g, SAMPLE_NAME);
}

export default function EmailPreviewPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const inviteHtml = renderTemplate('invite.html');
  const magicLinkHtml = renderTemplate('magic-link.html');
  const requestReceived = requestReceivedEmail(SAMPLE_NAME);

  const cards: { label: string; subject: string; html: string }[] = [
    { label: 'Invite', subject: "You're invited to Steele & Co.", html: inviteHtml },
    { label: 'Magic link', subject: 'Your Steele & Co. sign-in link', html: magicLinkHtml },
    { label: 'Request received', subject: requestReceived.subject, html: requestReceived.html },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-gold text-xs tracking-widest uppercase">Dev preview</p>
        <h1 className="text-bone font-serif text-4xl">Transactional emails</h1>
        <p className="text-bone-muted text-sm">
          Local-only preview of the three templates billy sends. Substitutes sample values for
          template variables. Not reachable in production.
        </p>
      </header>

      {cards.map((c) => (
        <section key={c.label} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-bone font-serif text-2xl">{c.label}</h2>
            <p className="text-bone-faint font-mono text-xs">{c.subject}</p>
          </div>
          <iframe
            title={`${c.label} preview`}
            srcDoc={c.html}
            className="border-hairline-strong min-h-[640px] w-full border-2 bg-white"
          />
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Sanity check**

```bash
pnpm typecheck
```

Expected: passes.

Start the dev server (in a separate terminal) and visit the preview:

```bash
pnpm dev -p 3100
```

Then in a browser: `http://localhost:3100/dev/email-preview`. Expected: three iframes stacked vertically, each rendering its template with the sample values substituted. The "Invite" iframe should show "Hi Sample Athlete," and the "Accept invitation" gold-bordered button. The magic-link iframe should show "Click below to sign in to prospect@example.com." Request-received should match what was already built in Plan 2.

If any iframe is empty or shows raw `{{ .Variable }}` text, the substitution regex didn't match — most likely because the template uses a different variable form. Inspect with browser devtools and adjust.

Stop the dev server.

- [ ] **Step 4: Verify the production gate**

The page calls `notFound()` when `NODE_ENV === 'production'`. We can't easily test that locally without a prod build, but we can verify the gate is wired right by reading the source.

```bash
pnpm typecheck
```

Expected: passes (the function compiles).

- [ ] **Step 5: Commit**

```bash
git add app/dev/email-preview/page.tsx proxy.ts
git commit -m "feat(dev): /dev/email-preview route for visual QA of all templates"
```

---

## Task 6: Local smoke test — run all three flows end-to-end via Inbucket

This is a manual-but-scripted check that the templates render correctly when actually sent through gotrue and Resend (request-received). No code changes.

- [ ] **Step 1: Start dev server**

```bash
pnpm dev -p 3100
```

- [ ] **Step 2: Smoke `/login` (magic-link template)**

In a fresh incognito window, visit `http://localhost:3100/login`. Type `smoketest+magic@example.com`, submit. Open Inbucket at `http://localhost:54324`, mailbox `smoketest+magic`. Open the latest message. Expected:

- **Subject:** "Your Steele & Co. sign-in link"
- **Body:** Vault-themed HTML matching the `magic-link.html` template, with `{{ .ConfirmationURL }}` rendered as a real verify URL and `{{ .Email }}` rendered as `smoketest+magic@example.com`.

If subject is "Your Magic Link" (default) or HTML is plaintext, the template didn't load — see Task 3 troubleshooting.

- [ ] **Step 3: Smoke `/coach/requests` approval (invite template)**

Sign in as `coach+e2e@example.com` (use Inbucket to fetch the magic-link if needed). Visit `http://localhost:3100/coach/requests`. Approve any pending request (or submit a fresh one via `/request-to-join` first if none are pending). Then check Inbucket for the prospect's mailbox. Open the latest invite message. Expected:

- **Subject:** "You're invited to Steele & Co."
- **Body:** Vault-themed HTML matching `invite.html`, with `{{ .Data.name }}` rendered as the prospect's name and `{{ .ConfirmationURL }}` rendered as a real verify URL.

If the approve action errors with "already registered" because the email exists in `auth.users` from prior test runs, that's the existing-user branch we built in Plan 2 — pick a different prospect email or move on.

- [ ] **Step 4: Smoke `/request-to-join` (request-received template)**

Open another incognito window, visit `http://localhost:3100/request-to-join`. Submit a form using `van@cfbcllc.com` as the email (the only address Resend's sandbox can deliver to). Expected: redirect to `/thanks`, and within ~30s a real email arrives at `van@cfbcllc.com` with subject "We received your inquiry — Steele & Co." and the existing Vault-themed body. (This template was built in Plan 2 and isn't being changed here, just confirming nothing regressed.)

- [ ] **Step 5: Stop the dev server.**

- [ ] **Step 6: Commit (only if any tweaks were needed).**

If smoke surfaced template rendering issues that required HTML edits, commit them now:

```bash
git add supabase/templates
git commit -m "fix(email): smoke-test adjustments to vault email templates"
```

If smoke was all green, no commit needed for this task — the value is the verification, not new code.

---

## Task 7: Production rollout runbook

**Files:**
- Create: `docs/superpowers/runbooks/2026-04-27-plan-25-resend-rollout.md`

A step-by-step runbook covering Resend domain verification, DNS records, Supabase Dashboard SMTP config, Vercel env updates, and prod smoke. This is a docs-only task — no code, no tests.

- [ ] **Step 1: Create the runbook**

Create `docs/superpowers/runbooks/2026-04-27-plan-25-resend-rollout.md`:

```markdown
# Plan 2.5 — Resend / Supabase SMTP rollout

**Date drafted:** 2026-04-27
**Pre-reqs:** Templates committed (Tasks 1–3 of Plan 2.5), local smoke green (Task 6).
**Blocker:** William must pick the verified domain before any of this runs.

---

## Step 1 — Pick the domain

Pending William's answer. Candidates:
- `mail.cfbcllc.com` (if Van owns `cfbcllc.com` and provides DNS access)
- `mail.steele-co.com` (if William registers `steele-co.com` and provides DNS access)
- Some other domain William chooses

Once chosen, fill `<domain>` in every step below.

---

## Step 2 — Verify the domain in Resend

1. Sign into Resend dashboard (https://resend.com/domains).
2. Click "Add Domain". Enter `<domain>`. Resend generates three CNAME records (SPF, DKIM, DMARC).
3. Copy the records to the domain's DNS provider (Cloudflare / Route 53 / Namecheap / wherever):
   - `<txt-host>` `TXT` `<spf-value>`
   - `<dkim-host>` `CNAME` `<dkim-value>`
   - `_dmarc.<domain>` `TXT` `<dmarc-value>`
4. Wait for propagation. Resend re-checks every minute; "Verified" status typically lands within 5-30 min.
5. Confirm green status in Resend dashboard before proceeding.

---

## Step 3 — Configure SMTP on the remote Supabase project

The remote project's SMTP config is set via Dashboard, not config.toml. (Local dev keeps Inbucket; we don't need parity here.)

1. Sign into Supabase Dashboard for the billy project.
2. Go to **Project Settings → Auth → SMTP Settings**.
3. Enable "Custom SMTP".
4. Fill in:
   - **Sender email:** `noreply@<domain>`
   - **Sender name:** `Steele & Co.` (or whatever From-name William picks)
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** the existing Resend API key (same value as `RESEND_API_KEY` in `.env.local`)
5. Click "Save".
6. Test send: in the same panel, click "Send test email" with `van@cfbcllc.com` as the recipient. Confirm it arrives within ~30s, From header is `Steele & Co. <noreply@<domain>>`, body is Supabase's plain test message.

---

## Step 4 — Push template config to remote

The templates live in `supabase/config.toml` + `supabase/templates/*.html` (committed in Tasks 1-3). The remote project needs them too.

1. Confirm the remote project ref. From Supabase dashboard → Project Settings → General → Reference ID. Copy it.
2. Link locally:

   ```bash
   pnpm exec supabase link --project-ref <ref>
   ```

3. Push the config + templates:

   ```bash
   pnpm exec supabase config push
   ```

   Expected: "Configuration updated for project <ref>" or similar. If the CLI version doesn't expose `config push`, use `supabase db push` (which syncs config alongside migrations) or copy the template HTML into the Dashboard's Email Template editor manually as a fallback.

4. Verify in Dashboard → Auth → Email Templates that the Invite and Magic Link templates now show the Vault HTML.

---

## Step 5 — Update Vercel env

1. Open the billy project on Vercel → Settings → Environment Variables.
2. Update `RESEND_FROM_EMAIL` from `onboarding@resend.dev` to `noreply@<domain>` for **Production** (and Preview / Development if you want preview deployments to also use the verified sender).
3. Redeploy the production branch so the env change takes effect.

---

## Step 6 — Production smoke

After deploy completes:

1. **Magic-link.** From an incognito window, hit prod `/login`. Submit `van@cfbcllc.com`. Confirm:
   - Email arrives at `van@cfbcllc.com` real inbox within ~30s.
   - From header: `Steele & Co. <noreply@<domain>>`.
   - Subject: "Your Steele & Co. sign-in link".
   - Body matches `supabase/templates/magic-link.html`.
   - Click the link → lands on prod `/coach` (or `/app` depending on the user's role).

2. **Invite.** Submit prod `/request-to-join` form with a fresh fake email (e.g., `prospect-prod-test@example.com`). As coach, approve it. Confirm:
   - Invite email arrives at the prospect address (Resend may bounce since example.com isn't real — check Resend dashboard for delivery status).
   - From, subject, body all branded.

3. **Request-received.** Confirm the same `/request-to-join` submission also delivers the request-received confirmation to `van@cfbcllc.com` (since that's the registered Resend account address — only it gets actual delivery in early days; for full delivery to any recipient, that's exactly what Step 2 of this runbook unlocks).

4. **Watch Resend dashboard** for delivery, bounce, and spam-flag rates over the first 24 hours.

---

## Rollback

If anything goes wrong (Resend domain fails verification, SMTP creds wrong, templates render broken):

1. **Quickest rollback:** Supabase Dashboard → Auth → SMTP Settings → toggle "Custom SMTP" OFF. gotrue immediately falls back to the default Supabase sender. Auth flows still work; emails just look generic again.
2. Revert the Vercel `RESEND_FROM_EMAIL` change to `onboarding@resend.dev` (or remove it; the default in `.env.example` is the sandbox).
3. Investigate the failure offline. Re-run the runbook once the issue is resolved.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/runbooks/2026-04-27-plan-25-resend-rollout.md
git commit -m "docs(plan-2.5): production rollout runbook for resend / supabase SMTP"
```

---

## Task 8: Final smoke + push

- [ ] **Step 1: Run all gates**

```bash
pnpm typecheck
```
Expected: passes.

```bash
pnpm lint
```
Expected: 0 errors. Pre-existing warning count unchanged (1).

```bash
pnpm test
```
Expected: 23/23 unit + integration tests pass (Plan 2.5 added no test code, no tests should have changed).

```bash
pnpm test:e2e
```
Expected: 7/7 e2e tests pass. (The `/dev/email-preview` route is allowlisted by `proxy.ts` but isn't exercised by any e2e — that's fine; visual QA is the test for it.)

- [ ] **Step 2: Confirm clean working tree**

```bash
git status --short
```
Expected: clean (only untracked `.claude/` and `shell.cmd`, both gitignored).

```bash
git log --oneline origin/main..HEAD
```
Expected: lists Plan 2.5 commits (templates, config, env example, dev preview, runbook).

- [ ] **Step 3: Push**

```bash
git push origin main
```

Plan 2.5's local work is shipped. Production rollout is gated on William's domain answer; runbook is committed for when that lands.

---

## Self-review checklist (run after the plan is implemented)

- [ ] `supabase/templates/invite.html` renders Vault-branded HTML when sent via Inbucket.
- [ ] `supabase/templates/magic-link.html` renders Vault-branded HTML when sent via Inbucket.
- [ ] Subject lines match the spec ("You're invited to Steele & Co." / "Your Steele & Co. sign-in link").
- [ ] `/dev/email-preview` shows all three templates side-by-side with sample values substituted.
- [ ] `/dev/email-preview` returns 404 when `NODE_ENV === 'production'`.
- [ ] Existing tests still pass (typecheck, lint, unit, e2e).
- [ ] Local Supabase still routes auth emails through Inbucket (no SMTP set in `config.toml`).
- [ ] `.env.example` documents the prod swap of `RESEND_FROM_EMAIL`.
- [ ] Production rollout runbook is committed and references the spec.
- [ ] No service-role secret ends up in client code.

---

## Known limitations to log for V1

- Domain choice is blocked on William; runbook can't run until that's answered.
- Resend's free tier (3,000/month, 100/day) is fine for V1 but will need monitoring once Plan 3's check-in alerts go out.
- SMTP config is not version-controlled (lives in Supabase Dashboard). Acceptable for V1 single-environment; revisit if billy gets a staging environment.

---

## Notes for the executor

- After every task, run `pnpm typecheck && pnpm test` before committing — catches regressions early.
- The `/dev/email-preview` page substitutes preview values via regex — if you change the template variables (e.g., add `{{ .Data.coach_name }}`), update the regex list in `app/dev/email-preview/page.tsx` to match.
- Supabase template hot-reload is unreliable; restart `pnpm exec supabase` after editing `config.toml` even if `supabase status` looks fine.
- All `git commit` messages should follow the repo's existing convention: lowercase scope, imperative mood, body lines wrapped at ~72 chars. `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer is added by the agent harness.
- Append a session-log entry to `.session-logs/session-<date>.md` after Task 8 completes (per the project's session-log rule).
