# Plan 1: Foundation & Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js + Supabase + Vercel + Sentry foundation with magic-link auth and role-based access, ending with an authenticated user reaching a role-appropriate empty dashboard in production.

**Architecture:** Single Next.js 16 (App Router) repo on Vercel. Supabase provides Postgres + magic-link auth + RLS. Two role spaces (`/coach/*`, `/app/*`) gated by Next.js middleware *and* Postgres RLS. Sentry captures errors. CI runs lint + types + tests on every PR.

**Tech Stack:** Next.js 16 (App Router, TypeScript strict, React 19), Supabase JS v2 (`@supabase/ssr`), **Tailwind v4 (CSS-based config via `@theme`)**, Zod, Vitest + Testing Library, Playwright, Sentry, ESLint + Prettier, pnpm, GitHub Actions.

**Toolchain note (2026-04-25):** Next.js 16 was released between this plan being written and Task 1 being executed. `pnpm create next-app@latest` now defaults to Next 16 + React 19 + Tailwind v4 + `next.config.ts` (not `.mjs`). The plan has been updated to match. Functionally equivalent for everything we're building.

**Spec reference:** `docs/superpowers/specs/2026-04-25-billy-coaching-platform-design.md`

**Working directory for all commands:** `C:\Users\van\Desktop\billy` (use forward slashes in bash). All `pnpm` commands run from the repo root unless noted.

---

## File map (Plan 1 only)

| Path | Purpose |
|---|---|
| `package.json`, `pnpm-lock.yaml`, `tsconfig.json` | Project root config |
| `next.config.ts` | Next.js + Sentry config (Next 16 default is `.ts`) |
| `.env.example` | Documented env var template (committed) |
| `.env.local` | Real local env vars (gitignored) |
| `app/layout.tsx` | Root layout with Vault aesthetic (fonts, theme) |
| `app/globals.css` | Tailwind v4 `@theme` block defines Vault color tokens — no separate `tailwind.config.ts` |
| `app/page.tsx` | Public landing placeholder |
| `app/(auth)/login/page.tsx` | Magic-link login form |
| `app/(auth)/auth/callback/route.ts` | Magic-link redirect handler |
| `app/(auth)/auth/sign-out/route.ts` | Sign-out POST handler |
| `app/coach/layout.tsx` | Coach-section layout (wraps `/coach/*`) |
| `app/coach/page.tsx` | Empty coach dashboard |
| `app/app/layout.tsx` | Athlete-section layout (wraps `/app/*`) |
| `app/app/page.tsx` | Empty athlete dashboard |
| `middleware.ts` | Role-based route gating |
| `lib/supabase/client.ts` | Browser Supabase client |
| `lib/supabase/server.ts` | Server Supabase client (RSC + Route Handlers) |
| `lib/supabase/middleware.ts` | Middleware-context Supabase client (cookie refresh) |
| `lib/auth/get-user-role.ts` | Look up `coach_id` or `athlete_id` for current `auth.uid()` |
| `lib/sentry.ts` | Sentry init helper |
| `supabase/migrations/0001_init_coaches_athletes.sql` | Initial schema |
| `supabase/migrations/0002_rls_coaches_athletes.sql` | RLS policies |
| `supabase/seed.sql` | Optional dev seed |
| `tests/unit/get-user-role.test.ts` | Unit test for role lookup |
| `tests/unit/rls-policies.test.ts` | RLS isolation test (integration via Supabase test client) |
| `tests/e2e/auth-flow.spec.ts` | E2E magic-link flow |
| `tests/e2e/role-routing.spec.ts` | E2E middleware gating |
| `playwright.config.ts` | Playwright config |
| `vitest.config.ts` | Vitest config |
| `.github/workflows/ci.yml` | CI: install, typecheck, lint, unit, e2e |
| `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` | Sentry init for each runtime |

---

## Pre-flight (ONCE, before Task 1)

The user must perform these account-side actions before Task 1 — these are not codeable. Document but do not block on them yet (we use a placeholder Supabase project that gets swapped in):

- [ ] **PF-1.** Create a Supabase project (free tier) at https://supabase.com/dashboard. Note: project URL, anon key, service role key.
- [ ] **PF-2.** Create a Vercel account at https://vercel.com (free tier). Connect to GitHub.
- [ ] **PF-3.** Create a Sentry project at https://sentry.io (Next.js platform). Note the DSN.
- [ ] **PF-4.** Create a GitHub repo `billy` (private). Note the SSH or HTTPS URL.
- [ ] **PF-5.** Install `pnpm` globally if not present: `npm install -g pnpm` (verify: `pnpm --version` ≥ 9).
- [ ] **PF-6.** ~~Global Supabase CLI install~~ — **superseded.** Supabase deprecated `npm install -g supabase`. We install Supabase CLI as a project dev dependency in **Task 2** instead. All `supabase` commands in this plan run as `pnpm exec supabase ...`.

---

## Task 1: Initialize Next.js project with strict TypeScript

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.mjs`, `next-env.d.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`

- [ ] **Step 1: Scaffold Next.js into the existing repo**

The repo is already initialized with `.gitignore` and `docs/`. Scaffold Next.js *into the current directory*.

Run from the worktree root:

```bash
pnpm create next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir false \
  --eslint \
  --import-alias "@/*" \
  --use-pnpm \
  --yes
```

> **Note:** `--yes` accepts all defaults non-interactively, including overwriting `.gitignore`. Back up the existing `.gitignore` before scaffolding and restore it after. Or merge any new entries Next adds (typically `.next/`, `*.tsbuildinfo`) into the original.

Expected: directory now contains `package.json`, `app/`, `next.config.ts`, etc. (Tailwind v4 does **not** generate a `tailwind.config.ts` — config lives in `app/globals.css`.)

- [ ] **Step 2: Tighten TypeScript settings to strict**

Replace the contents of `tsconfig.json` with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Verify the project builds**

Run:

```bash
pnpm build
```

Expected: build completes with no errors. Output ends with "Compiled successfully" and a route table including `/`.

- [ ] **Step 4: Verify dev server starts**

Run:

```bash
pnpm dev
```

Expected: server starts at `http://localhost:3000`. Open in browser — see the default Next.js page. Then `Ctrl+C` to stop.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 app router with strict TypeScript"
```

---

## Task 2: Install core runtime dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Supabase + Zod + utility libs**

```bash
pnpm add @supabase/supabase-js@^2 @supabase/ssr@^0.5 zod@^3 clsx@^2
```

- [ ] **Step 2: Install dev dependencies (testing, types, lint helpers, Supabase CLI)**

```bash
pnpm add -D \
  vitest@^2 @vitejs/plugin-react@^4 \
  @testing-library/react@^16 @testing-library/jest-dom@^6 jsdom@^25 \
  @playwright/test@^1.48 \
  prettier@^3 prettier-plugin-tailwindcss@^0.6 \
  @types/node@^22 \
  supabase@^1.226
```

- [ ] **Step 3: Verify install succeeded**

```bash
pnpm install
pnpm exec tsc --noEmit
```

Expected: `pnpm install` completes; `tsc` exits with code 0 and no output.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add Supabase, Zod, testing, and lint dependencies"
```

---

## Task 3: Configure Prettier + ESLint consistency

**Files:**
- Create: `.prettierrc.json`, `.prettierignore`
- Modify: `eslint.config.mjs` (or `.eslintrc.json` depending on Next version)

- [ ] **Step 1: Add Prettier config**

Create `.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

Create `.prettierignore`:

```
.next
node_modules
pnpm-lock.yaml
public
docs
.superpowers
```

- [ ] **Step 2: Add npm scripts**

Edit `package.json` `scripts` block to be exactly:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 3: Run formatter once**

```bash
pnpm format
pnpm typecheck
pnpm lint
```

Expected: all three pass with no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add prettier config and unified npm scripts"
```

---

## Task 4: Apply the "Vault" base theme (colors, fonts, layout)

**Files:**
- Modify: `app/globals.css`, `app/layout.tsx`
- Create: `app/page.tsx` (replace default)

> **Tailwind v4 note:** Tailwind v4 ships with `create-next-app` and uses **CSS-based configuration** via `@theme` blocks in `globals.css` — there is no `tailwind.config.ts` file. All design tokens live in CSS custom properties inside `@theme`. The classes `bg-ink-950`, `text-bone`, `text-gold`, etc. are auto-generated from the variable names. This is a deliberate Tailwind v4 architectural choice.

- [ ] **Step 1: Replace `app/globals.css` with Vault tokens (Tailwind v4 syntax)**

```css
@import "tailwindcss";

@theme {
  --color-ink-950: #080808;
  --color-ink-900: #0a0a0a;
  --color-ink-800: #0c0c0c;
  --color-ink-700: #16140f;

  --color-bone: #f4f0e8;
  --color-bone-muted: #a39d8a;
  --color-bone-faint: #6a6457;

  --color-gold: #c9a14c;
  --color-gold-dim: #9a7a36;

  --color-hairline: #1a1814;
  --color-hairline-strong: #1f1d18;

  --font-serif: 'Spectral', Georgia, serif;
  --font-sans: 'Inter', system-ui, sans-serif;

  --tracking-wider: 0.05em;
  --tracking-widest: 0.2em;
}

@layer base {
  html, body {
    background-color: var(--color-ink-950);
    color: var(--color-bone);
    -webkit-font-smoothing: antialiased;
    font-feature-settings: 'tnum' 1, 'cv11' 1;
  }
  ::selection {
    background-color: color-mix(in srgb, var(--color-gold) 30%, transparent);
    color: var(--color-bone);
  }
}
```

> **Step 2 deleted** — Tailwind v4 has no separate config file. Tokens above are the entire config.

- [ ] **Step 2: Replace `app/layout.tsx` with Vault root layout**

```tsx
import type { Metadata } from 'next';
import { Inter, Spectral } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const spectral = Spectral({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Steele & Co. — Powerlifting Coaching',
  description: 'A standard of excellence, under the bar.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spectral.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Replace `app/page.tsx` with a minimal Vault landing**

```tsx
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-8 px-6 py-24">
      <p className="text-xs uppercase tracking-widest text-gold">Steele &amp; Co.</p>
      <h1 className="font-serif text-5xl leading-tight tracking-tight text-bone md:text-6xl">
        A standard of <em className="text-gold">excellence</em>,<br />under the bar.
      </h1>
      <p className="max-w-xl text-bone-muted">
        Coaching for serious powerlifters. Programming, accountability, and meet preparation
        from a national-level coach.
      </p>
      <div className="flex gap-3 pt-2">
        <a
          href="/request-to-join"
          className="border border-gold px-5 py-2 text-xs uppercase tracking-widest text-gold transition hover:bg-gold hover:text-ink-950"
        >
          Inquire
        </a>
        <a
          href="/login"
          className="px-5 py-2 text-xs uppercase tracking-widest text-bone-muted transition hover:text-bone"
        >
          Sign in
        </a>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verify visually**

```bash
pnpm dev
```

Open `http://localhost:3000`. Expected: black page with serif headline, gold accent, bordered "Inquire" button. Stop server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: apply Vault aesthetic baseline (colors, fonts, landing)"
```

---

## Task 5: Set up Supabase locally + initial migration for coaches/athletes

**Files:**
- Create: `supabase/config.toml` (auto-generated), `supabase/migrations/0001_init_coaches_athletes.sql`

- [ ] **Step 1: Initialize Supabase in the repo**

```bash
pnpm exec supabase init
```

Expected: creates `supabase/` directory with `config.toml` and `seed.sql`.

- [ ] **Step 2: Start the local Supabase stack**

```bash
pnpm exec supabase start
```

Expected: Docker containers spin up; output shows local API URL (typically `http://localhost:54321`), Studio URL, anon key, service_role key.

**Capture these values** — you'll paste them into `.env.local` in Task 6.

- [ ] **Step 3: Create migration `0001_init_coaches_athletes.sql`**

Create file `supabase/migrations/0001_init_coaches_athletes.sql`:

```sql
-- Plan 1 schema: minimal foundation. Other tables added in Plan 2+.

create extension if not exists "uuid-ossp";

create table public.coaches (
  id            uuid primary key default uuid_generate_v4(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  display_name  text not null,
  email         text not null unique,
  phone         text,
  business_name text,
  bio           text,
  weight_unit_preference text not null default 'lbs' check (weight_unit_preference in ('lbs', 'kg')),
  created_at    timestamptz not null default now()
);

create table public.athletes (
  id            uuid primary key default uuid_generate_v4(),
  coach_id      uuid not null references public.coaches(id) on delete restrict,
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  name          text not null,
  email         text not null unique,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index idx_athletes_coach on public.athletes(coach_id);
create index idx_athletes_auth_user on public.athletes(auth_user_id);
```

- [ ] **Step 4: Apply migration**

```bash
pnpm exec supabase db reset
```

Expected: drops and recreates the local DB, applies the migration. Output ends with "Finished supabase db reset."

- [ ] **Step 5: Verify tables exist**

```bash
pnpm exec supabase db dump --schema public
```

Expected: output includes `CREATE TABLE public.coaches` and `CREATE TABLE public.athletes`.

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "feat(db): initial schema for coaches and athletes"
```

---

## Task 6: Configure environment variables (local + example)

**Files:**
- Create: `.env.example`, `.env.local`

- [ ] **Step 1: Create `.env.example` (committed template)**

```
# Supabase (local dev defaults from `supabase start`)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-start>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-from-supabase-start>

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# App
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 2: Create `.env.local` (gitignored — fill in real values)**

Copy `.env.example` to `.env.local` and paste the actual `anon key` and `service_role key` from the `supabase start` output captured in Task 5 Step 2. Leave Sentry blank for now (filled in Task 16).

```bash
cp .env.example .env.local
# then edit .env.local with the real keys
```

- [ ] **Step 3: Verify `.env.local` is gitignored**

```bash
git status
```

Expected: `.env.local` does NOT appear in untracked files.

- [ ] **Step 4: Commit `.env.example` only**

```bash
git add .env.example
git commit -m "chore: document environment variables"
```

---

## Task 7: Create Supabase client utilities (browser, server, middleware)

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`

- [ ] **Step 1: Create browser client**

`lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Create server client (RSC + Route Handlers)**

`lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — cookie writes are no-ops there.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Create middleware client (cookie refresh on every request)**

`lib/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session if expired — required for Server Components.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, supabase, user };
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: passes with no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase
git commit -m "feat(auth): add Supabase client utilities for browser, server, middleware"
```

---

## Task 8: Build the magic-link login page

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/login/actions.ts`

- [ ] **Step 1: Create the server action**

`app/(auth)/login/actions.ts`:

```ts
'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Schema = z.object({ email: z.string().email() });

export type LoginState = { ok: boolean; error?: string };

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = Schema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { ok: false, error: 'Please enter a valid email.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    return { ok: false, error: 'Could not send link. Try again in a moment.' };
  }
  return { ok: true };
}
```

- [ ] **Step 2: Create the login page**

`app/(auth)/login/page.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { sendMagicLink, type LoginState } from './actions';

const initial: LoginState = { ok: false };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(sendMagicLink, initial);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-6 px-6">
      <p className="text-xs uppercase tracking-widest text-gold">Sign in</p>
      <h1 className="font-serif text-3xl text-bone">Enter your email.</h1>
      <p className="text-sm text-bone-muted">
        We'll send a one-tap sign-in link. No passwords.
      </p>

      {state.ok ? (
        <p className="border-l-2 border-gold pl-3 text-sm text-bone">
          Link sent. Check your inbox (and spam).
        </p>
      ) : (
        <form action={formAction} className="flex w-full flex-col gap-3">
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="border border-hairline-strong bg-ink-900 px-3 py-2 text-bone outline-none focus:border-gold"
            placeholder="you@email.com"
          />
          {state.error && <p className="text-sm text-red-400">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="border border-gold px-4 py-2 text-xs uppercase tracking-widest text-gold transition hover:bg-gold hover:text-ink-950 disabled:opacity-50"
          >
            {pending ? 'Sending…' : 'Send link'}
          </button>
        </form>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Manual verification**

```bash
pnpm dev
```

Open `http://localhost:3000/login`. Expected: form renders. Submit a fake email — see "Link sent" (Supabase local stack accepts any email and stores the magic link in **Inbucket** at `http://localhost:54324`). Stop server.

- [ ] **Step 4: Commit**

```bash
git add app/(auth)
git commit -m "feat(auth): magic-link login page with server action"
```

---

## Task 9: Build the auth callback handler

**Files:**
- Create: `app/(auth)/auth/callback/route.ts`, `app/(auth)/auth/sign-out/route.ts`

- [ ] **Step 1: Create callback handler**

`app/(auth)/auth/callback/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${url.origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${url.origin}/login?error=invalid_or_expired`);
  }

  // Role-based landing handled by middleware on next request; for now, send to /app.
  // Real role redirect lives in Task 11 once `getUserRole` exists.
  return NextResponse.redirect(`${url.origin}/app`);
}
```

- [ ] **Step 2: Create sign-out handler**

`app/(auth)/auth/sign-out/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add app/(auth)/auth
git commit -m "feat(auth): magic-link callback and sign-out routes"
```

---

## Task 10: Add RLS policies for coaches and athletes

**Files:**
- Create: `supabase/migrations/0002_rls_coaches_athletes.sql`

- [ ] **Step 1: Write the policy migration**

`supabase/migrations/0002_rls_coaches_athletes.sql`:

```sql
-- Enable RLS on every table from Day 1.
alter table public.coaches  enable row level security;
alter table public.athletes enable row level security;

-- COACHES: a coach can read/update only their own row.
create policy "coach reads own row"
  on public.coaches for select
  using (auth_user_id = auth.uid());

create policy "coach updates own row"
  on public.coaches for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ATHLETES: a coach can read/update athletes they own.
create policy "coach reads own athletes"
  on public.athletes for select
  using (
    coach_id in (select id from public.coaches where auth_user_id = auth.uid())
  );

create policy "coach inserts own athletes"
  on public.athletes for insert
  with check (
    coach_id in (select id from public.coaches where auth_user_id = auth.uid())
  );

create policy "coach updates own athletes"
  on public.athletes for update
  using (
    coach_id in (select id from public.coaches where auth_user_id = auth.uid())
  );

-- ATHLETES: an athlete can read their own row.
create policy "athlete reads own row"
  on public.athletes for select
  using (auth_user_id = auth.uid());

create policy "athlete updates own row"
  on public.athletes for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
```

- [ ] **Step 2: Apply migration**

```bash
pnpm exec supabase db reset
```

Expected: both migrations apply cleanly. Last line: "Finished supabase db reset."

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_rls_coaches_athletes.sql
git commit -m "feat(db): RLS policies for coaches and athletes"
```

---

## Task 11: Build `getUserRole` helper + role-based middleware

**Files:**
- Create: `lib/auth/get-user-role.ts`, `middleware.ts`

- [ ] **Step 1: Write `getUserRole`**

`lib/auth/get-user-role.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type UserRole =
  | { kind: 'coach'; coachId: string }
  | { kind: 'athlete'; athleteId: string; coachId: string }
  | { kind: 'unauthenticated' }
  | { kind: 'unlinked' }; // logged in but not yet linked to coach or athlete row

export async function getUserRole(supabase: SupabaseClient): Promise<UserRole> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: 'unauthenticated' };

  // Try coach lookup first.
  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (coach) return { kind: 'coach', coachId: coach.id };

  // Then athlete.
  const { data: athlete } = await supabase
    .from('athletes')
    .select('id, coach_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (athlete) return { kind: 'athlete', athleteId: athlete.id, coachId: athlete.coach_id };

  return { kind: 'unlinked' };
}
```

- [ ] **Step 2: Write the middleware**

`middleware.ts` (at repo root, NOT inside `app/`):

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { getUserRole } from '@/lib/auth/get-user-role';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/auth/callback',
  '/auth/sign-out',
  '/request-to-join',
  '/privacy',
  '/terms',
  '/refund-policy',
  '/error',
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/_next') || pathname.startsWith('/api/webhooks');
}

export async function middleware(request: NextRequest) {
  const { response, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return response;

  const role = await getUserRole(supabase);

  if (role.kind === 'unauthenticated') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/coach') && role.kind !== 'coach') {
    const url = request.nextUrl.clone();
    url.pathname = role.kind === 'athlete' ? '/app' : '/login';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/app') && role.kind !== 'athlete') {
    const url = request.nextUrl.clone();
    url.pathname = role.kind === 'coach' ? '/coach' : '/login';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)'],
};
```

- [ ] **Step 3: Update `/auth/callback` to redirect by role**

Replace `app/(auth)/auth/callback/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth/get-user-role';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${url.origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${url.origin}/login?error=invalid_or_expired`);
  }

  const role = await getUserRole(supabase);
  if (role.kind === 'coach')   return NextResponse.redirect(`${url.origin}/coach`);
  if (role.kind === 'athlete') return NextResponse.redirect(`${url.origin}/app`);
  // Unlinked accounts: send to a friendly holding page (built in Plan 2).
  return NextResponse.redirect(`${url.origin}/login?error=account_not_yet_linked`);
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts lib/auth app/(auth)/auth/callback/route.ts
git commit -m "feat(auth): role-based middleware and callback redirect"
```

---

## Task 12: Build empty coach + athlete dashboards

**Files:**
- Create: `app/coach/layout.tsx`, `app/coach/page.tsx`, `app/app/layout.tsx`, `app/app/page.tsx`, `components/sign-out-button.tsx`

- [ ] **Step 1: Create reusable sign-out button**

`components/sign-out-button.tsx`:

```tsx
export function SignOutButton() {
  return (
    <form action="/auth/sign-out" method="post">
      <button
        type="submit"
        className="text-xs uppercase tracking-widest text-bone-muted transition hover:text-bone"
      >
        Sign out
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Coach layout**

`app/coach/layout.tsx`:

```tsx
import { SignOutButton } from '@/components/sign-out-button';

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
        <p className="font-serif text-bone">Steele &amp; Co. <span className="text-gold">·</span> Coach</p>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Empty coach dashboard**

`app/coach/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';

export default async function CoachDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs uppercase tracking-widest text-gold">Coach dashboard</p>
      <h1 className="font-serif text-4xl text-bone">Welcome back.</h1>
      <p className="text-bone-muted">Signed in as {user?.email}.</p>
      <p className="border-l-2 border-hairline-strong pl-3 text-sm text-bone-muted">
        Athletes, programs, and alerts will appear here once Plan 2 ships.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Athlete layout**

`app/app/layout.tsx`:

```tsx
import { SignOutButton } from '@/components/sign-out-button';

export default function AthleteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
        <p className="font-serif text-bone">Steele &amp; Co.</p>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
    </div>
  );
}
```

- [ ] **Step 5: Empty athlete dashboard**

`app/app/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';

export default async function AthleteDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs uppercase tracking-widest text-gold">Today</p>
      <h1 className="font-serif text-4xl text-bone">Welcome back.</h1>
      <p className="text-bone-muted">Signed in as {user?.email}.</p>
      <p className="border-l-2 border-hairline-strong pl-3 text-sm text-bone-muted">
        Your program and check-ins will appear here once Plan 3 ships.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Manual verification**

```bash
pnpm dev
```

Visit `http://localhost:3000/coach` and `http://localhost:3000/app` while signed out — both should redirect to `/login`. Stop server.

- [ ] **Step 7: Commit**

```bash
git add app/coach app/app components
git commit -m "feat: empty coach and athlete dashboards with sign-out"
```

---

## Task 13: Vitest setup + unit test for `getUserRole`

**Files:**
- Create: `vitest.config.ts`, `tests/setup.ts`, `tests/unit/get-user-role.test.ts`

- [ ] **Step 1: Vitest config**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

`tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Write the failing test**

`tests/unit/get-user-role.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { getUserRole } from '@/lib/auth/get-user-role';

function mockSupabase(opts: {
  user?: { id: string } | null;
  coach?: { id: string } | null;
  athlete?: { id: string; coach_id: string } | null;
}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: opts.user ?? null } }) },
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: table === 'coaches' ? opts.coach ?? null : opts.athlete ?? null,
      }),
    })),
  } as never;
}

describe('getUserRole', () => {
  it('returns unauthenticated when no user', async () => {
    const role = await getUserRole(mockSupabase({ user: null }));
    expect(role).toEqual({ kind: 'unauthenticated' });
  });

  it('returns coach when coach row exists', async () => {
    const role = await getUserRole(
      mockSupabase({ user: { id: 'u1' }, coach: { id: 'c1' } }),
    );
    expect(role).toEqual({ kind: 'coach', coachId: 'c1' });
  });

  it('returns athlete when athlete row exists', async () => {
    const role = await getUserRole(
      mockSupabase({ user: { id: 'u1' }, athlete: { id: 'a1', coach_id: 'c1' } }),
    );
    expect(role).toEqual({ kind: 'athlete', athleteId: 'a1', coachId: 'c1' });
  });

  it('returns unlinked when user has no coach or athlete row', async () => {
    const role = await getUserRole(mockSupabase({ user: { id: 'u1' } }));
    expect(role).toEqual({ kind: 'unlinked' });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

Expected: all 4 tests pass. (`getUserRole` already exists from Task 11, so tests pass on first run — this is a regression-protection test.)

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts tests
git commit -m "test: unit coverage for getUserRole"
```

---

## Task 14: Playwright setup + E2E magic-link & role-routing tests

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/auth-flow.spec.ts`, `tests/e2e/role-routing.spec.ts`, `tests/e2e/helpers/inbucket.ts`

- [ ] **Step 1: Install Playwright browsers**

```bash
pnpm exec playwright install --with-deps chromium
```

- [ ] **Step 2: Playwright config**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 3: Inbucket helper (reads magic-link emails from local Supabase)**

`tests/e2e/helpers/inbucket.ts`:

```ts
const INBUCKET = 'http://localhost:54324';

export async function getMagicLinkFor(email: string): Promise<string> {
  const mailbox = email.split('@')[0]!;
  // Poll for up to 10s.
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${INBUCKET}/api/v1/mailbox/${mailbox}`);
    if (res.ok) {
      const messages = (await res.json()) as Array<{ id: string }>;
      if (messages.length > 0) {
        const last = messages[messages.length - 1]!;
        const detail = await fetch(`${INBUCKET}/api/v1/mailbox/${mailbox}/${last.id}`);
        const message = (await detail.json()) as { body: { text: string; html: string } };
        const text = message.body?.text ?? message.body?.html ?? '';
        const match = text.match(/(http:\/\/localhost:3000\/auth\/callback\?code=[^\s"<]+)/);
        if (match) return match[1]!;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No magic link for ${email}`);
}

export async function clearInbucket(email: string) {
  const mailbox = email.split('@')[0]!;
  await fetch(`${INBUCKET}/api/v1/mailbox/${mailbox}`, { method: 'DELETE' });
}
```

- [ ] **Step 4: Auth-flow E2E test**

`tests/e2e/auth-flow.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { getMagicLinkFor, clearInbucket } from './helpers/inbucket';

test('magic-link flow lands on /login?error=account_not_yet_linked for unlinked user', async ({ page }) => {
  const email = `e2e-unlinked-${Date.now()}@example.com`;
  await clearInbucket(email);

  await page.goto('/login');
  await page.getByPlaceholder('you@email.com').fill(email);
  await page.getByRole('button', { name: /send link/i }).click();
  await expect(page.getByText(/link sent/i)).toBeVisible();

  const link = await getMagicLinkFor(email);
  await page.goto(link);

  // Unlinked user — callback redirects to /login with the friendly error.
  await expect(page).toHaveURL(/\/login\?error=account_not_yet_linked/);
});
```

- [ ] **Step 5: Role-routing E2E test**

`tests/e2e/role-routing.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('unauthenticated user hitting /coach is redirected to /login', async ({ page }) => {
  await page.goto('/coach');
  await expect(page).toHaveURL(/\/login$/);
});

test('unauthenticated user hitting /app is redirected to /login', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login$/);
});

test('public pages render without auth', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /standard of/i })).toBeVisible();
});
```

- [ ] **Step 6: Run E2E tests**

Local Supabase must be running. Verify:

```bash
pnpm exec supabase status
```

Then:

```bash
pnpm test:e2e
```

Expected: 4 tests pass. (The auth-flow test is the slowest at ~10s.)

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts tests/e2e
git commit -m "test(e2e): playwright auth flow and role routing"
```

---

## Task 15: RLS isolation integration test

**Files:**
- Create: `tests/integration/rls-policies.test.ts`

- [ ] **Step 1: Write the test**

`tests/integration/rls-policies.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://localhost:54321';
// Service-role key from `supabase status` — local-only, safe to hardcode for tests.
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function makeUserClient(email: string) {
  const { data: created } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (!created.user) throw new Error('createUser failed');

  // Issue a session for the user via signInWithPassword fallback (admin-set password).
  await admin.auth.admin.updateUserById(created.user.id, { password: 'TestPass123!' });
  const userClient = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  await userClient.auth.signInWithPassword({ email, password: 'TestPass123!' });
  return { client: userClient, userId: created.user.id };
}

describe('RLS — coaches and athletes are isolated', () => {
  let coachAUserId: string;
  let coachBUserId: string;
  let coachAId: string;
  let coachBId: string;
  let athleteAClient: ReturnType<typeof createClient>;
  let athleteBClient: ReturnType<typeof createClient>;
  let athleteARowId: string;
  let athleteBRowId: string;

  beforeAll(async () => {
    // Two coaches, each with one athlete. Set up via service role.
    const ca = await makeUserClient(`coach-a-${Date.now()}@test.local`);
    coachAUserId = ca.userId;
    const cb = await makeUserClient(`coach-b-${Date.now()}@test.local`);
    coachBUserId = cb.userId;

    const { data: rowA } = await admin
      .from('coaches')
      .insert({ auth_user_id: coachAUserId, display_name: 'Coach A', email: `coach-a-${Date.now()}@test.local` })
      .select('id')
      .single();
    coachAId = rowA!.id;
    const { data: rowB } = await admin
      .from('coaches')
      .insert({ auth_user_id: coachBUserId, display_name: 'Coach B', email: `coach-b-${Date.now()}@test.local` })
      .select('id')
      .single();
    coachBId = rowB!.id;

    const aa = await makeUserClient(`athlete-a-${Date.now()}@test.local`);
    athleteAClient = aa.client;
    const ab = await makeUserClient(`athlete-b-${Date.now()}@test.local`);
    athleteBClient = ab.client;

    const { data: athA } = await admin
      .from('athletes')
      .insert({ coach_id: coachAId, auth_user_id: aa.userId, name: 'Athlete A', email: `ath-a-${Date.now()}@test.local` })
      .select('id')
      .single();
    athleteARowId = athA!.id;

    const { data: athB } = await admin
      .from('athletes')
      .insert({ coach_id: coachBId, auth_user_id: ab.userId, name: 'Athlete B', email: `ath-b-${Date.now()}@test.local` })
      .select('id')
      .single();
    athleteBRowId = athB!.id;
  }, 30_000);

  it("athlete A cannot read athlete B's row", async () => {
    const { data, error } = await athleteAClient
      .from('athletes')
      .select('id')
      .eq('id', athleteBRowId);
    expect(error).toBeNull();
    expect(data).toEqual([]); // RLS filters silently — no rows returned.
  });

  it('athlete A can read their own row', async () => {
    const { data, error } = await athleteAClient
      .from('athletes')
      .select('id')
      .eq('id', athleteARowId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Update Vitest config to include integration tests**

Modify `vitest.config.ts` `test.include` to:

```ts
include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx', 'tests/integration/**/*.test.ts'],
```

And add an env loader so integration tests pick up `.env.local`:

```ts
import { loadEnv } from 'vite';

// In defineConfig, replace with: defineConfig(({ mode }) => ({
//   ...
//   test: { ...
//     env: loadEnv(mode, process.cwd(), ''),
//   },
// }))
```

Final `vitest.config.ts`:

```ts
import { defineConfig, loadEnv } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx', 'tests/integration/**/*.test.ts'],
    env: loadEnv(mode, process.cwd(), ''),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
}));
```

- [ ] **Step 3: Run the test**

Local Supabase must be running.

```bash
pnpm test
```

Expected: all unit + integration tests pass (5 passing total).

- [ ] **Step 4: Commit**

```bash
git add tests/integration vitest.config.ts
git commit -m "test(integration): RLS enforces athlete row isolation"
```

---

## Task 16: Install + configure Sentry

**Files:**
- Create: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`
- Modify: `next.config.mjs`

- [ ] **Step 1: Install Sentry SDK**

```bash
pnpm add @sentry/nextjs@^8
```

- [ ] **Step 2: Create Sentry init files**

`sentry.client.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
```

`sentry.server.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
```

`sentry.edge.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
```

`instrumentation.ts`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
```

- [ ] **Step 3: Wrap `next.config.ts` with Sentry**

Replace `next.config.ts`:

```ts
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  hideSourceMaps: true,
  disableLogger: true,
  telemetry: false,
});
```

- [ ] **Step 4: Verify build still works (Sentry unconfigured = no-op)**

```bash
pnpm build
```

Expected: build succeeds. Sentry's plugin emits "Skipping Sentry source-map upload" since no auth token is set yet.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(observability): integrate Sentry SDK"
```

---

## Task 17: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push: { branches: [main] }

jobs:
  check:
    runs-on: ubuntu-latest
    services:
      supabase:
        image: supabase/postgres:15.1.0.117
        ports: ['54322:5432']
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm test  # unit tests only — integration + e2e need full Supabase stack
```

> Note: integration & E2E tests run locally for now. We'll add a `supabase-cli`-based job in Plan 7 (pre-launch hardening) once the suite is large enough to justify the CI complexity.

- [ ] **Step 2: Verify locally that CI commands all pass**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

Expected: every command exits 0.

- [ ] **Step 3: Commit**

```bash
git add .github
git commit -m "ci: typecheck, lint, format, unit tests on every PR"
```

---

## Task 18: Push to GitHub + connect to Vercel

This task has manual steps the operator performs once. Document and verify.

**Files:** none

- [ ] **Step 1: Push to GitHub**

User-side (replace `<your-github-url>`):

```bash
git remote add origin <your-github-url>
git branch -M main
git push -u origin main
```

Expected: GitHub repo `billy` now contains the full project history.

- [ ] **Step 2: Connect Vercel project to the repo**

In the Vercel dashboard:
1. **Add New → Project** → import the `billy` repo.
2. Framework: Next.js (auto-detected). Root directory: `./`.
3. **Environment variables** (paste from `.env.local`, but using the *production* Supabase project URL/keys, not local):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SENTRY_DSN`
   - `SENTRY_AUTH_TOKEN`
   - `NEXT_PUBLIC_SITE_URL` (set to the Vercel-assigned URL, e.g. `https://billy.vercel.app`)
4. Click **Deploy**.

Expected: deployment succeeds. Vercel returns a `https://billy-*.vercel.app` URL.

- [ ] **Step 3: Apply the migrations to the production Supabase project**

In a terminal:

```bash
pnpm exec supabase link --project-ref <your-prod-project-ref>
pnpm exec supabase db push
```

Expected: both migrations apply against the production database.

- [ ] **Step 4: Verify production deploy**

Visit the Vercel URL. Expected: landing page renders. Visit `/coach` and `/app` — both redirect to `/login`. Visit `/login` — form renders. Submit your real email — magic link arrives in inbox (check spam first time). Click link → redirects to `/login?error=account_not_yet_linked` (because no coach/athlete row yet — expected behavior; resolved in Plan 2).

- [ ] **Step 5: Commit (no changes — but tag the milestone)**

```bash
git tag plan-1-complete
git push --tags
```

---

## Task 19: Document operator runbook

**Files:**
- Create: `docs/operator/runbook.md`

- [ ] **Step 1: Write the runbook**

`docs/operator/runbook.md`:

```markdown
# Operator Runbook

## Daily/weekly tasks
- **Check Sentry inbox** for new error classes (~weekly).
- **Merge Renovate PRs** if CI is green (~weekly).
- **Glance at Vercel Analytics** for traffic anomalies (~monthly).

## Local development
1. `pnpm exec supabase start` — boot local DB.
2. `pnpm dev` — Next.js at localhost:3000.
3. Magic-link emails go to Inbucket: http://localhost:54324.

## Common commands
- `pnpm typecheck` — catch type errors.
- `pnpm lint` — code style.
- `pnpm test` — unit + integration tests.
- `pnpm test:e2e` — Playwright E2E (Supabase + dev server must be running).
- `pnpm format` — auto-format.

## Emergency: production is down
1. Check Vercel deployment status — most "down" is just a deploy in progress.
2. Check Supabase status page: https://status.supabase.com.
3. Check Sentry for spike in errors — usually identifies the cause in seconds.
4. Roll back via Vercel: Project → Deployments → previous successful deploy → "Promote to Production."

## Rotating secrets
1. Generate new key in Supabase / Sentry / Stripe dashboard.
2. Update value in Vercel env vars.
3. Trigger redeploy via Vercel UI.
4. Revoke the old key after verifying the new one works.

## Adding a new coach (Plan 1 only — manual SQL)
While we're still in Plan 1, coach rows are created manually:

```sql
insert into public.coaches (auth_user_id, display_name, email)
select id, 'William Steele', email
from auth.users
where email = '<william-email>';
```

Run via Supabase Studio SQL editor. Plan 2 introduces an admin-only setup flow.
```

- [ ] **Step 2: Commit**

```bash
git add docs/operator
git commit -m "docs: operator runbook"
```

---

## Self-review checklist (Plan 1)

After all tasks complete, verify:

- [ ] Spec §3 stack confirmed: Next.js + Supabase + Vercel + Sentry — all present.
- [ ] Spec §5 role enforcement: middleware (Task 11) + RLS policies (Task 10) — both present and tested (Tasks 14, 15).
- [ ] Spec §9 security baseline: RLS enabled, magic-link only auth, env vars in Vercel only, HTTPS via Vercel — all in place.
- [ ] Spec §10 self-healing: Sentry installed, CI runs on every PR, deploy auto-rollback via Vercel — present.
- [ ] Spec §11 Vault aesthetic: colors, fonts, headline style applied to landing + dashboards.

**What's still missing (intentionally — covered by later plans):**
- Onboarding wizard, request-to-join, coach setup flow → Plan 2
- Athlete profile fields (weight class, maxes, etc.) → Plan 2
- Programs, workout logs, check-ins, set logs → Plan 3
- Coach dashboard alerts feed → Plan 4
- Public profiles → Plan 5
- Donations → Plan 6
- Pre-launch hardening → Plan 7

---

## Definition of done for Plan 1

- ✅ Pushing to `main` deploys to Vercel.
- ✅ A real human can submit their email and receive a magic link from production.
- ✅ Following the link sets a session cookie.
- ✅ Hitting `/coach` or `/app` while signed out redirects to `/login`.
- ✅ Unlinked authenticated users land on `/login?error=account_not_yet_linked`.
- ✅ All unit tests pass.
- ✅ RLS integration test confirms cross-athlete data isolation.
- ✅ E2E tests pass locally.
- ✅ CI runs on every PR.
- ✅ Sentry captures any thrown error.

When all of those are true, **Plan 1 is done**. Tag `plan-1-complete` on the merge commit.
