# Plan 7a — Public Athlete Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. The spec at `docs/superpowers/specs/2026-04-29-billy-plan-7a-public-profiles-design.md` has all the SQL, Zod, and helper code blocks. This plan organizes the work into tasks; refer to spec for verbatim content.

**Goal:** Ship `athlete_public_profiles` schema + athlete editor + coach approval + public `/team` pages. Donations deferred to Plan 7b.

**Builds on:** Plans 1-6 + 3.5. Reuses `auth_athlete_id()`, `auth_coach_id()`, `getCurrentAthlete`, `getCurrentCoach`.

**Working dir:** `C:\Users\van\Desktop\billy`. Prefix shell with `cd "/c/Users/van/Desktop/billy" &&`.

---

## File map

| Path | Purpose |
|---|---|
| `supabase/migrations/0014_athlete_public_profiles.sql` | Table + RLS (see spec §4) |
| `lib/public-profiles/slugify.ts` | Slug helper |
| `lib/public-profiles/schemas.ts` | Zod (see spec §7) |
| `lib/public-profiles/get-own.ts` | Athlete fetcher |
| `lib/public-profiles/list-team.ts` | Public team list |
| `lib/public-profiles/get-by-slug.ts` | Public single profile |
| `lib/public-profiles/actions/save-own.ts` | Athlete upsert (server-derives slug) |
| `lib/public-profiles/actions/approve.ts` | Coach approve / unpublish |
| `app/app/profile/public/page.tsx` + form | Athlete editor |
| `app/coach/athletes/[id]/page.tsx` | Modify: add Public Profile section with approve/unpublish |
| `app/team/page.tsx` | Public team list |
| `app/team/[slug]/page.tsx` | Public detail |
| `proxy.ts` | Modify: add `/team` to public paths |
| `tests/integration/public-profiles/rls.test.ts` | RLS tests |
| `tests/unit/public-profiles/slugify.test.ts` | Slug helper tests |
| `tests/e2e/public-profiles/athlete-publishes.spec.ts` | E2e flow |

---

## Tasks

### Task 1: Migration 0014 + RLS integration test (TDD)

Write failing test, apply migration, verify green. Verbatim SQL in spec §4.

Integration test (~6 cases):
- Athlete A SELECTs own (any state)
- Athlete B cannot SELECT A's UNPUBLISHED profile
- Coach A SELECTs A's profile (any state)
- Coach B cannot SELECT A's profile
- Anonymous client can SELECT a PUBLISHED profile
- Anonymous client cannot SELECT an UNPUBLISHED profile
- (Bonus) Coach can UPDATE is_published; athlete can UPDATE bio

Use `makeUserClient` pattern from existing RLS tests. Anonymous client = `createClient(URL, ANON, { auth: { persistSession: false } })` with no sign-in.

Commit: `feat(public-profiles): athlete_public_profiles table + RLS`.

### Task 2: Slug helper + schemas + unit tests

`lib/public-profiles/slugify.ts`:
```ts
export function slugify(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
```

Unit tests (~4): "Alex Reyes" → "alex-reyes" · drops punctuation · collapses spaces · trims dashes.

Schemas in `lib/public-profiles/schemas.ts` per spec §7. Unit tests (~3): valid full · invalid headline (empty) · meet results array.

Commit: `feat(public-profiles): slugify helper + zod schemas`.

### Task 3: Server actions + fetchers

Create:
- `lib/public-profiles/get-own.ts` — `getOwnPublicProfile()` returns `{ profile: ... | null, suggestedSlug: string }`
- `lib/public-profiles/list-team.ts` — `listPublicTeam()` returns published profiles (use anon-or-authed Supabase client; RLS handles)
- `lib/public-profiles/get-by-slug.ts` — `getPublicProfileBySlug(slug)` returns one published profile
- `lib/public-profiles/actions/save-own.ts` — athlete upsert with server-derived slug:
  ```ts
  // On first INSERT: derive slug from athlete name; if collision, append -2, -3
  let candidate = slugify(athlete.name);
  let n = 1;
  while (true) {
    const { error } = await supabase.from('athlete_public_profiles').insert({
      athlete_id: athlete.id, slug: candidate, headline, bio, photo_url, recent_meet_results,
    });
    if (!error) break;
    if (error.code === '23505') { // unique violation
      n += 1; candidate = `${slugify(athlete.name)}-${n}`;
      if (n > 50) return mask('slug_exhausted', { message: 'no slug' });
      continue;
    }
    return mask('insert', error);
  }
  ```
- `lib/public-profiles/actions/approve.ts` — `approvePublicProfile(athleteId)` and `unpublishPublicProfile(athleteId)`. Coach scope.

Keep masked-error pattern from Plan 4-6.

Commit: `feat(public-profiles): server actions + fetchers`.

### Task 4: Athlete editor at /app/profile/public

`app/app/profile/public/page.tsx` (server) + client form. Form has:
- Headline input (required, max 120)
- Bio textarea (required, max 4000)
- Photo URL input (optional)
- Recent meet results — repeater with add/remove rows; each row has meet name, date, total lbs, placement
- Submit button → calls saveOwnPublicProfile
- Status banner: "Pending coach approval" if profile exists with is_published=false; "Published as /team/<slug>" link if is_published=true

Add Profile link to /app layout nav between Check-in and Sign out.

Commit: `feat(public-profiles): /app/profile/public athlete editor`.

### Task 5: Coach approval on athlete detail page

Modify `app/coach/athletes/[id]/page.tsx` to add a Public Profile section:
- If athlete has no profile yet: "Athlete hasn't created a public profile yet."
- If profile exists but unpublished: show preview + "Approve & publish" button
- If published: show preview + link to /team/<slug> + "Unpublish" button

Approve/unpublish forms POST to `/coach/athletes/[id]/profile/approve` and `/coach/athletes/[id]/profile/unpublish` route handlers (or server actions inline). Choose route handlers for HTML form submit.

Commit: `feat(public-profiles): coach approval on athlete detail page`.

### Task 6: Public /team list + /team/[slug] detail + proxy.ts update

`app/team/page.tsx`:
```tsx
import Link from 'next/link';
import { listPublicTeam } from '@/lib/public-profiles/list-team';

export const metadata = { title: 'Team · Steele & Co.' };

export default async function TeamPage() {
  const profiles = await listPublicTeam();
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">Steele & Co.</p>
        <h1 className="text-bone font-serif text-4xl">The Team</h1>
      </header>
      {profiles.length === 0 ? (
        <p className="text-bone-muted">No athletes have published profiles yet.</p>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => (
            <li key={p.id} className="border-hairline-strong border bg-[#16140f] p-6">
              {p.photoUrl && <img src={p.photoUrl} alt="" className="mb-4 aspect-square w-full object-cover grayscale" />}
              <h2 className="text-bone font-serif text-2xl">
                <Link href={`/team/${p.slug}`}>{p.athleteName}</Link>
              </h2>
              <p className="text-bone-muted mt-2 text-sm">{p.headline}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

`app/team/[slug]/page.tsx` (full editorial page):
```tsx
import { notFound } from 'next/navigation';
import { getPublicProfileBySlug } from '@/lib/public-profiles/get-by-slug';

export default async function TeamMemberPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPublicProfileBySlug(slug);
  if (!p) notFound();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-gold text-xs tracking-widest uppercase">Steele & Co. — Team</p>
        <h1 className="text-bone font-serif text-5xl">{p.athleteName}</h1>
        <p className="text-bone-muted text-lg">{p.headline}</p>
      </header>
      {p.photoUrl && <img src={p.photoUrl} alt="" className="border-hairline-strong border-2 grayscale" />}
      <div className="text-bone whitespace-pre-line text-base leading-relaxed">{p.bio}</div>
      {p.recentMeetResults && p.recentMeetResults.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-bone-muted text-xs tracking-widest uppercase">Recent meets</h2>
          <table className="text-bone tabular-nums">
            <thead><tr className="text-bone-faint border-b border-[#1f1d18] text-left text-xs uppercase">
              <th className="py-2 pr-6 font-normal">Date</th>
              <th className="py-2 pr-6 font-normal">Meet</th>
              <th className="py-2 pr-6 font-normal">Total</th>
              <th className="py-2 pr-6 font-normal">Place</th>
            </tr></thead>
            <tbody>
              {p.recentMeetResults.map((m, i) => (
                <tr key={i} className="border-b border-[#1a1814]/40">
                  <td className="py-2 pr-6">{m.date}</td>
                  <td className="py-2 pr-6">{m.meet}</td>
                  <td className="py-2 pr-6">{m.total_lbs} lb</td>
                  <td className="py-2 pr-6">{m.placement ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
```

Modify `proxy.ts` `isPublic()` — add `pathname.startsWith('/team')` to the OR list.

Commit: `feat(public-profiles): public /team list and /team/[slug] detail`.

### Task 7: E2e + final gates + push

E2e spec `tests/e2e/public-profiles/athlete-publishes.spec.ts`:
- Athlete signs in, fills profile (headline, bio), saves
- Coach signs in (separate context), visits /coach/athletes/<id>, clicks "Approve & publish"
- Anonymous browser context visits /team — sees the athlete's name + headline
- Anonymous visits /team/<slug> — sees the bio

Final gates: typecheck, lint, vitest, e2e. Push to origin/main.

Kill dev server before e2e if needed; restart after.

Commit: `test(public-profiles): e2e for athlete-publish-coach-approve flow + final gates`.

---

## Self-review

- All 14 files at correct paths
- 3 commits per major chunk (or split per task — your call)
- All gates green
- Pushed to origin/main
- Dev server restarted at end

## Known limitations

- No photo upload (V1.5)
- No rejection-with-reason (V1.5)
- Coach can technically overwrite bio via direct DB UPDATE (RLS allows it; trust model accepts; V1.5 may add column-level CHECK)
- Donations deferred (Plan 7b)
