# Plan 7a — Public Athlete Profiles: Design Spec

**Date:** 2026-04-29
**Builds on:** Plans 1-6 + 3.5.
**Reference:** V1 spec §6.5 athlete_public_profiles, §7 page map, §8.8 publish flow.

---

## 1. Goal

Athletes can write a public bio (headline, paragraph, recent meet results, optional photo). Coach reviews and approves before publication. Once approved, the bio appears on a public `/team` page (no auth) and at `/team/[slug]`. Marketing surface for William's coaching business.

**Donations are deferred to Plan 7b** (gated on William's Stripe Connect onboarding). Plan 7a ships everything except the "Donate" button.

---

## 2. Scope

### In scope
- Schema: `athlete_public_profiles` (one per athlete, optional)
- RLS: athletes CRUD own; coaches review/approve own athletes; PUBLIC SELECT for `is_published=true`
- Athlete-side `/app/profile/public` editor
- Coach-side approve/unpublish action on athlete detail page
- Public `/team` page (no auth) listing all published profiles
- Public `/team/[slug]` individual profile detail
- Slug auto-generation from athlete name on first save
- Tests: unit (schema), integration (RLS), e2e (full publish flow)

### Out of scope (Plan 7b / V1.5+)
- Donate button + Stripe Checkout — Plan 7b
- Donations history page — Plan 7b
- Photo upload via Supabase Storage — Plan 7c (use a simple `photo_url` text field for V1; coach pastes a URL or leaves blank)
- Profile-rejection-with-reason workflow — V1.5
- SEO meta tags / OpenGraph — V1.5
- Coach-side preview before publish — V1.5

---

## 3. Decisions

| Decision | Value | Why |
|---|---|---|
| Photo handling | text URL field; no upload | V1 simplification; coach pastes a hosted URL or leaves blank. Supabase Storage upload deferred to V1.5 for kept-simple shipping. |
| Slug generation | server-derives from athlete name on first save (e.g., "alex-reyes"); UNIQUE; collisions get a `-2` suffix | Athletes don't pick slugs; URL stability owned by the system. |
| Approval state | `is_published` boolean (false by default), `published_at` timestamp, `coach_approved_by` references coaches.id | Per V1 spec §6.5. |
| Coach approval action | "Approve & publish" sets is_published=true + published_at + coach_approved_by; "Unpublish" clears them | Two distinct buttons; symmetric. |
| Athlete edits after approval | Allowed; edits do NOT auto-unpublish (small UX): coach unpublishes if needed | V1: trust the athlete-coach relationship. V1.5 may add change-tracking. |
| Public read | RLS policy: `for select using (is_published = true)` open to anon + authenticated | The whole point. |
| Recent meet results | `jsonb` array of `{ meet, date, total_lbs, placement }`. Athlete fills via simple repeater UI. | Per V1 spec §6.5. |
| Empty state | Athletes with no profile see a friendly "Create your public profile" CTA on `/app/profile/public` | Welcoming. |
| `/team` empty state | "No athletes have published profiles yet." | Defensive. |

---

## 4. Schema changes

Migration `0014_athlete_public_profiles.sql`:

```sql
create table public.athlete_public_profiles (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null unique references public.athletes(id) on delete cascade,
  slug text not null unique,
  headline text not null,
  bio text not null,
  photo_url text,
  recent_meet_results jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  published_at timestamptz,
  coach_approved_by uuid references public.coaches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index athlete_public_profiles_published_idx on public.athlete_public_profiles(is_published) where is_published = true;

create or replace function public.bump_app_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger app_bump_updated_at
  before update on public.athlete_public_profiles
  for each row execute function public.bump_app_updated_at();

alter table public.athlete_public_profiles enable row level security;

-- Athlete: full CRUD on own profile.
create policy app_athlete_select on public.athlete_public_profiles
  for select using (athlete_id = public.auth_athlete_id());
create policy app_athlete_insert on public.athlete_public_profiles
  for insert with check (athlete_id = public.auth_athlete_id());
create policy app_athlete_update on public.athlete_public_profiles
  for update using (athlete_id = public.auth_athlete_id())
  with check (athlete_id = public.auth_athlete_id());
create policy app_athlete_delete on public.athlete_public_profiles
  for delete using (athlete_id = public.auth_athlete_id());

-- Coach: SELECT all own athletes' profiles, UPDATE only is_published / published_at /
-- coach_approved_by (not bio/etc — that's the athlete's content).
create policy app_coach_select on public.athlete_public_profiles
  for select using (athlete_id in (
    select id from public.athletes where coach_id = public.auth_coach_id()
  ));
create policy app_coach_update on public.athlete_public_profiles
  for update using (athlete_id in (
    select id from public.athletes where coach_id = public.auth_coach_id()
  ))
  with check (athlete_id in (
    select id from public.athletes where coach_id = public.auth_coach_id()
  ));

-- Public read: anonymous + authenticated can read published profiles only.
create policy app_public_select on public.athlete_public_profiles
  for select to anon, authenticated using (is_published = true);
```

> Note: the coach UPDATE policy is broader than ideal (technically lets coach overwrite bio). V1 trust model accepts this; V1.5 may add column-level CHECK to restrict coach updates to approval fields only.

---

## 5. Page map

| Route | Auth | Purpose |
|---|---|---|
| `/team` | public | List of published athletes |
| `/team/[slug]` | public | Individual published profile |
| `/app/profile/public` | athlete | Athlete edits own profile + sees publish state |
| `/coach/athletes/[id]` (modify) | coach | Adds Public Profile section with approve/unpublish |

`/team` and `/team/[slug]` need to be added to `proxy.ts` PUBLIC_PATHS (public, no auth).

---

## 6. Server actions

| Function | Purpose |
|---|---|
| `getOwnPublicProfile()` | Athlete reads own profile + computes a slug preview if none yet |
| `saveOwnPublicProfile(input)` | Athlete upserts own profile. Server-derives slug on first INSERT. |
| `approvePublicProfile(athleteId)` | Coach sets is_published=true, published_at=now(), coach_approved_by=coach.id |
| `unpublishPublicProfile(athleteId)` | Coach clears those fields |
| `listPublicTeam()` | Public — RLS-scoped to is_published=true |
| `getPublicProfileBySlug(slug)` | Public — single profile by slug |

---

## 7. Validation

```ts
const meetResultSchema = z.object({
  meet: z.string().min(1).max(120),
  date: z.string().date(),
  total_lbs: z.number().min(0).max(2500),
  placement: z.string().max(20).optional().nullable(),
});

export const savePublicProfileSchema = z.object({
  headline: z.string().min(1).max(120),
  bio: z.string().min(1).max(4000),
  photoUrl: z.string().url().max(500).optional().nullable(),
  recentMeetResults: z.array(meetResultSchema).max(10),
});
```

---

## 8. Slug generation

Pure helper, server-side:

```ts
export function slugify(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
```

On first INSERT, server tries `slugify(athlete.name)`. If that's taken, append `-2`, `-3` etc until unique.

---

## 9. Tasks

1. Migration 0014 + RLS integration test (~6 tests: athlete CRUD own, coach SELECT/UPDATE, public reads only published)
2. Slug helper + Zod schemas + unit tests
3. Server actions (saveOwnPublicProfile + getOwnPublicProfile + approvePublicProfile + unpublishPublicProfile + listPublicTeam + getPublicProfileBySlug)
4. /app/profile/public page + form
5. /coach/athletes/[id] Public Profile section
6. /team list + /team/[slug] detail (with proxy.ts public-paths update)
7. E2e (athlete-edits-coach-approves-public-renders flow) + final gates + push

---

## 10. Tests

- **Unit:** slugify, schema validation
- **Integration:** RLS — athlete owns, coach reviews, anon reads published only
- **E2e:** athlete creates profile → coach approves → /team shows the bio (anonymous browser context)

---

## 11. UX

- Athlete editor uses simple form (textareas + URL input + meet-results repeater with add/remove rows)
- Coach approval is a single button on athlete detail; unpublish is a separate button when published
- /team is a card grid of athlete profiles — name, weight class (from Plan 3.5 metadata), headline, photo
- /team/[slug] is a serif-headlined editorial page — full bio, meet results table, photo

---

## 12. Edge cases

| Case | Handling |
|---|---|
| Athlete saves before coach approves | Profile exists in DB with is_published=false; not visible on /team |
| Coach approves before athlete writes anything | Approve button disabled if profile doesn't exist or has empty headline/bio |
| Slug collision | Helper appends -2, -3 etc until unique INSERT succeeds |
| Athlete name change after slug generation | Slug stays stable (don't auto-rename) |
| Athlete deactivates their account | Cascade deletes the profile via FK ON DELETE CASCADE |

---

## 13. Out of scope (Plan 7b / V1.5+)

- Donate button → Plan 7b
- Photo upload → Plan 7c
- Rejection-with-reason → V1.5
- Social share / OG meta → V1.5
- Coach-edits-bio with attribution → V1.5
- Public team page with filters / sort → V1.5

---

## 14. Next step

Plan written, then execute via subagent-driven-development.
