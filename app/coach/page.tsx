import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { listMissedWorkoutAthletes } from '@/lib/coach-dashboard/list-missed-workouts';
import { listPainReports } from '@/lib/coach-dashboard/list-pain-reports';
import { listLowReadinessCheckIns } from '@/lib/coach-dashboard/list-low-readiness';
import { listRecentActivity } from '@/lib/coach-dashboard/list-recent-activity';

type Counts = { pending: number; invited: number; active: number };

async function loadCounts(): Promise<Counts> {
  const supabase = await createClient();
  const [pendingRes, invitedRes, activeRes] = await Promise.all([
    supabase
      .from('join_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase.from('athletes').select('id', { count: 'exact', head: true }).eq('status', 'invited'),
    supabase.from('athletes').select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ]);
  return {
    pending: pendingRes.count ?? 0,
    invited: invitedRes.count ?? 0,
    active: activeRes.count ?? 0,
  };
}

export default async function CoachDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const counts = await loadCounts();

  const [missed, pain, lowReady, recent] = await Promise.all([
    listMissedWorkoutAthletes(),
    listPainReports(10),
    listLowReadinessCheckIns(10),
    listRecentActivity(10),
  ]);

  const cards = [
    {
      label: 'Pending requests',
      value: counts.pending,
      href: '/coach/requests',
      cta: 'Review',
    },
    {
      label: 'Active athletes',
      value: counts.active,
      href: '/coach/athletes',
      cta: 'View roster',
    },
    {
      label: 'Awaiting first sign-in',
      value: counts.invited,
      href: '/coach/athletes',
      cta: 'View roster',
    },
  ];

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <p className="text-gold text-xs tracking-widest uppercase">Coach dashboard</p>
        <h1 className="text-bone font-serif text-4xl">Welcome back.</h1>
        <p className="text-bone-muted">Signed in as {user?.email}.</p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="border-hairline-strong hover:border-gold focus-visible:outline-gold flex flex-col gap-3 border-2 p-6 transition focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <p className="text-bone-faint text-xs tracking-widest uppercase">{c.label}</p>
            <p className="text-bone font-serif text-5xl">{c.value}</p>
            <p className="text-gold mt-2 text-xs tracking-widest uppercase">{c.cta} →</p>
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-bone-muted text-xs tracking-widest uppercase">Quick actions</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Link
            href="/coach/programs/new?mode=blank"
            className="border-hairline-strong hover:border-gold flex flex-col gap-2 border bg-[#16140f] p-5 transition"
          >
            <p className="text-gold text-xs tracking-widest uppercase">Build template</p>
            <p className="text-bone font-serif text-lg">New program for everyone</p>
            <p className="text-bone-muted text-xs">
              Build once, assign to multiple athletes.
            </p>
          </Link>
          <Link
            href="/coach/athletes/invite"
            className="border-hairline-strong hover:border-gold flex flex-col gap-2 border bg-[#16140f] p-5 transition"
          >
            <p className="text-gold text-xs tracking-widest uppercase">Invite athlete</p>
            <p className="text-bone font-serif text-lg">Add a new client</p>
            <p className="text-bone-muted text-xs">
              Sends a magic-link invite to their email.
            </p>
          </Link>
          <Link
            href="/coach/programs"
            className="border-hairline-strong hover:border-gold flex flex-col gap-2 border bg-[#16140f] p-5 transition"
          >
            <p className="text-gold text-xs tracking-widest uppercase">Programs library</p>
            <p className="text-bone font-serif text-lg">All programs &amp; templates</p>
            <p className="text-bone-muted text-xs">
              Edit, archive, assign existing programs.
            </p>
          </Link>
        </div>
      </section>

      <section className="border-hairline-strong border bg-[#16140f] p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-bone font-serif text-xl">Donations &amp; revenue</h2>
          <p className="text-bone-faint text-xs tracking-widest uppercase">Coming soon</p>
        </div>
        <p className="text-bone-muted mt-3 text-sm">
          When Plan 7b ships (after your Stripe Connect onboarding), this card will show
          total donations received, recent contributions, and per-athlete breakdowns.
          Donations come from athletes&rsquo; public profiles on{' '}
          <Link href="/team" className="text-gold underline-offset-4 hover:underline">/team</Link>.
        </p>
        <div className="mt-3 flex items-baseline gap-6">
          <div>
            <p className="text-bone-faint text-xs tracking-widest uppercase">Total collected</p>
            <p className="text-bone font-serif text-3xl">$0</p>
          </div>
          <div>
            <p className="text-bone-faint text-xs tracking-widest uppercase">This month</p>
            <p className="text-bone font-serif text-3xl">$0</p>
          </div>
          <div>
            <p className="text-bone-faint text-xs tracking-widest uppercase">Pending payouts</p>
            <p className="text-bone font-serif text-3xl">$0</p>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-6">
        {/* 1. Missed workouts */}
        <section className="border-hairline-strong border bg-[#16140f] p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-bone font-serif text-xl">Missed workouts</h2>
            <p className="text-bone-faint text-xs tracking-widest uppercase">
              {missed.length === 0 ? 'All clear' : `${missed.length} flagged`}
            </p>
          </div>
          {missed.length === 0 ? (
            <p className="text-bone-muted mt-3 text-sm">No missed workouts.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#1a1814]">
              {missed.map((m) => (
                <li key={m.athleteId}>
                  <Link
                    href={`/coach/athletes/${m.athleteId}`}
                    className="hover:text-gold flex items-baseline justify-between py-2"
                  >
                    <span className="text-bone">{m.athleteName}</span>
                    <span className="text-bone-faint text-xs">
                      {m.lastLoggedAt
                        ? `last logged ${new Date(m.lastLoggedAt).toLocaleDateString()}`
                        : 'never logged'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 2. Pain reports */}
        <section className="border-hairline-strong border bg-[#16140f] p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-bone font-serif text-xl">Pain reports</h2>
            <p className="text-bone-faint text-xs tracking-widest uppercase">
              {pain.length === 0 ? 'All clear' : `${pain.length} reported`}
            </p>
          </div>
          {pain.length === 0 ? (
            <p className="text-bone-muted mt-3 text-sm">No pain reports in the last 14 days.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#1a1814]">
              {pain.map((p) => (
                <li key={`${p.source}-${p.id}`}>
                  <Link
                    href={`/coach/athletes/${p.athleteId}`}
                    className="hover:text-gold flex flex-col gap-1 py-2"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-bone">{p.athleteName}</span>
                      <span className="text-bone-faint text-xs">
                        {p.source} · {new Date(p.at).toLocaleDateString()}
                      </span>
                    </div>
                    <span className="text-bone-muted text-sm">
                      {p.painNotes.length > 80 ? `${p.painNotes.slice(0, 80)}…` : p.painNotes}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 3. Low readiness */}
        <section className="border-hairline-strong border bg-[#16140f] p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-bone font-serif text-xl">Low readiness</h2>
            <p className="text-bone-faint text-xs tracking-widest uppercase">
              {lowReady.length === 0 ? 'All clear' : `${lowReady.length} flagged`}
            </p>
          </div>
          {lowReady.length === 0 ? (
            <p className="text-bone-muted mt-3 text-sm">
              No low-readiness check-ins in the last 14 days.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[#1a1814]">
              {lowReady.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/coach/athletes/${r.athleteId}`}
                    className="hover:text-gold flex items-baseline justify-between py-2"
                  >
                    <span className="text-bone">{r.athleteName}</span>
                    <span className="text-bone-faint text-xs">
                      fatigue {r.fatigue} · soreness {r.soreness} · motivation {r.motivation}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 4. Recent activity */}
        <section className="border-hairline-strong border bg-[#16140f] p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-bone font-serif text-xl">Recent activity</h2>
            <p className="text-bone-faint text-xs tracking-widest uppercase">
              {recent.length === 0 ? 'Nothing yet' : `${recent.length} recent`}
            </p>
          </div>
          {recent.length === 0 ? (
            <p className="text-bone-muted mt-3 text-sm">No completed workouts yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#1a1814]">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/coach/athletes/${r.athleteId}`}
                    className="hover:text-gold flex items-baseline justify-between py-2"
                  >
                    <span className="text-bone">{r.athleteName}</span>
                    <span className="text-bone-faint text-xs">
                      {r.weekNumber !== null && r.dayNumber !== null
                        ? `Week ${r.weekNumber} Day ${r.dayNumber}`
                        : ''}
                      {r.programDayName ? ` · ${r.programDayName}` : ''}
                      {' · '}
                      {new Date(r.completedAt).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
