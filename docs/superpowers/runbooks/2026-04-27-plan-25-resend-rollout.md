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
