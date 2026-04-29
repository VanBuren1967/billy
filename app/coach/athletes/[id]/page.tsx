import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listRecentWorkoutLogs } from '@/lib/workouts/list-recent-logs';
import { listRecentCheckIns } from '@/lib/check-ins/list-recent';

export const metadata = { title: 'Athlete — Steele & Co.' };

type Athlete = {
  id: string;
  name: string;
  email: string;
  status: 'invited' | 'active' | 'inactive';
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
  weight_class: string | null;
  raw_or_equipped: 'raw' | 'equipped' | null;
  current_squat_max: number | null;
  current_bench_max: number | null;
  current_deadlift_max: number | null;
  weak_points: string | null;
  injury_history: string | null;
  experience_level: string | null;
  goal: 'hypertrophy' | 'strength' | 'meet_prep' | 'general' | null;
  meet_date: string | null;
  meet_name: string | null;
  coaching_type: 'hybrid' | 'online' | null;
};

export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('athletes')
    .select(
      'id, name, email, status, invited_at, accepted_at, created_at, ' +
        'weight_class, raw_or_equipped, current_squat_max, current_bench_max, ' +
        'current_deadlift_max, weak_points, injury_history, experience_level, ' +
        'goal, meet_date, meet_name, coaching_type',
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !data) notFound();
  const athlete = data as unknown as Athlete;

  const recentLogs = await listRecentWorkoutLogs(id, 10);
  const recentCheckIns = await listRecentCheckIns(id, 6);

  const { data: publicProfile } = await supabase
    .from('athlete_public_profiles')
    .select('id, slug, headline, bio, photo_url, recent_meet_results, is_published, published_at')
    .eq('athlete_id', id)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-12">
      <Link
        href="/coach/athletes"
        className="text-bone-muted hover:text-bone w-fit text-xs tracking-widest uppercase"
      >
        ← Back to roster
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-gold text-xs tracking-widest uppercase">Athlete</p>
        <h1 className="text-bone font-serif text-5xl tracking-tight">{athlete.name}</h1>
        <p className="text-bone-muted">{athlete.email}</p>
      </header>

      <section className="border-hairline-strong border bg-[#16140f] p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-bone-muted text-xs tracking-widest uppercase">Profile</h2>
          <Link
            href={`/coach/athletes/${id}/edit-profile`}
            className="text-gold text-xs tracking-widest uppercase"
          >
            Edit →
          </Link>
        </div>
        <dl className="text-bone tabular-nums mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
          <Item label="Weight class" value={athlete.weight_class} />
          <Item label="Raw / equipped" value={athlete.raw_or_equipped} />
          <Item label="Goal" value={athlete.goal?.replaceAll('_', ' ')} />
          <Item
            label="Squat max"
            value={athlete.current_squat_max ? `${athlete.current_squat_max} lb` : null}
          />
          <Item
            label="Bench max"
            value={athlete.current_bench_max ? `${athlete.current_bench_max} lb` : null}
          />
          <Item
            label="Deadlift max"
            value={athlete.current_deadlift_max ? `${athlete.current_deadlift_max} lb` : null}
          />
          <Item label="Coaching type" value={athlete.coaching_type} />
          <Item label="Experience" value={athlete.experience_level} />
          <Item
            label="Next meet"
            value={
              athlete.meet_date
                ? `${athlete.meet_date}${athlete.meet_name ? ` — ${athlete.meet_name}` : ''}`
                : null
            }
          />
        </dl>
        {athlete.weak_points && (
          <p className="text-bone-muted mt-3 text-xs">
            <strong className="text-bone-faint">Weak points:</strong> {athlete.weak_points}
          </p>
        )}
        {athlete.injury_history && (
          <p className="text-bone-muted mt-2 text-xs">
            <strong className="text-bone-faint">Injury history:</strong> {athlete.injury_history}
          </p>
        )}
      </section>

      <dl className="border-hairline-strong grid grid-cols-1 gap-x-8 gap-y-6 border-2 p-6 sm:grid-cols-2">
        <div>
          <dt className="text-bone-faint text-xs tracking-widest uppercase">Status</dt>
          <dd className="text-bone mt-1 font-serif">{athlete.status}</dd>
        </div>
        <div>
          <dt className="text-bone-faint text-xs tracking-widest uppercase">Invited</dt>
          <dd className="text-bone-muted mt-1">
            {athlete.invited_at ? new Date(athlete.invited_at).toLocaleString() : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-bone-faint text-xs tracking-widest uppercase">Accepted</dt>
          <dd className="text-bone-muted mt-1">
            {athlete.accepted_at ? new Date(athlete.accepted_at).toLocaleString() : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-bone-faint text-xs tracking-widest uppercase">Added</dt>
          <dd className="text-bone-muted mt-1">{new Date(athlete.created_at).toLocaleString()}</dd>
        </div>
      </dl>

      <section className="border-hairline-strong border-2 p-6">
        <p className="text-bone-faint text-xs tracking-widest uppercase">Coming soon</p>
        <p className="text-bone-muted mt-2 text-sm">
          Programs, workouts, and check-ins will appear here once Plan 3 ships.
        </p>
      </section>

      <section className="border-hairline-strong border bg-[#16140f] p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-bone-muted text-xs tracking-widest uppercase">Public profile</h2>
          {publicProfile?.is_published && (
            <Link href={`/team/${publicProfile.slug}`} className="text-gold text-xs tracking-widest uppercase">
              View live →
            </Link>
          )}
        </div>
        {!publicProfile ? (
          <p className="text-bone-faint mt-3 text-sm">Athlete hasn't created a public profile yet.</p>
        ) : (
          <>
            <p className="text-bone mt-3 font-serif text-xl">{publicProfile.headline}</p>
            <p className="text-bone-muted mt-2 line-clamp-3 text-sm">{publicProfile.bio.slice(0, 240)}{publicProfile.bio.length > 240 ? '…' : ''}</p>
            <div className="mt-4 flex items-baseline gap-3">
              {publicProfile.is_published ? (
                <>
                  <p className="text-gold text-xs tracking-widest uppercase">✓ Published</p>
                  <form action={`/coach/athletes/${id}/profile/unpublish`} method="post">
                    <button type="submit" className="text-bone-faint hover:text-rose-400 text-xs tracking-widest uppercase">
                      Unpublish
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <p className="text-bone-muted text-xs tracking-widest uppercase">Awaiting approval</p>
                  <form action={`/coach/athletes/${id}/profile/approve`} method="post">
                    <button type="submit" className="border-gold text-gold border px-4 py-2 text-xs tracking-widest uppercase">
                      Approve & publish
                    </button>
                  </form>
                </>
              )}
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-bone-muted text-xs tracking-widest uppercase">Recent workouts</h2>
        {recentLogs.length === 0 ? (
          <p className="text-bone-faint text-sm">No workouts logged yet.</p>
        ) : (
          <ul className="border-hairline-strong border divide-y divide-[#1a1814]">
            {recentLogs.map((l) => (
              <li key={l.id} className="flex items-baseline justify-between px-4 py-3">
                <div>
                  <p className="text-bone font-serif">
                    Week {l.weekNumber} · Day {l.dayNumber} — {l.programDayName ?? 'Unknown day'}
                  </p>
                  {l.painNotes && <p className="text-rose-400/80 mt-1 text-xs">Pain: {l.painNotes.slice(0, 80)}</p>}
                  {l.generalNotes && <p className="text-bone-muted mt-1 text-xs">{l.generalNotes.slice(0, 80)}</p>}
                </div>
                <div className="text-right">
                  {l.status === 'completed' ? (
                    <span className="text-gold text-xs tracking-widest uppercase">✓ Done</span>
                  ) : (
                    <span className="text-bone-faint text-xs tracking-widest uppercase">In progress</span>
                  )}
                  {l.completedAt && (
                    <p className="text-bone-faint mt-1 text-xs">
                      {new Date(l.completedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-bone-muted text-xs tracking-widest uppercase">Recent check-ins</h2>
        {recentCheckIns.length === 0 ? (
          <p className="text-bone-faint text-sm">No check-ins yet.</p>
        ) : (
          <ul className="border-hairline-strong border bg-[#16140f] divide-y divide-[#1a1814]">
            {recentCheckIns.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-bone-faint text-xs">Week of {c.weekStarting}</p>
                  <p className="text-bone-faint text-xs">{c.bodyweightLbs} lb</p>
                </div>
                <p className="text-bone tabular-nums mt-1 text-sm">
                  Fatigue {c.fatigue} · Soreness {c.soreness} · Confidence {c.confidence} · Motivation {c.motivation}
                  {c.meetReadiness != null && ` · Meet ${c.meetReadiness}`}
                </p>
                {c.painNotes && <p className="text-rose-400/80 mt-1 text-xs">Pain: {c.painNotes.slice(0, 100)}</p>}
                {c.comments && <p className="text-bone-muted mt-1 text-xs">{c.comments.slice(0, 120)}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-bone-faint text-xs tracking-widest uppercase">{label}</dt>
      <dd className="text-bone mt-0.5">{value || <span className="text-bone-faint">—</span>}</dd>
    </div>
  );
}
