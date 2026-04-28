import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listRecentWorkoutLogs } from '@/lib/workouts/list-recent-logs';

export const metadata = { title: 'Athlete — Steele & Co.' };

type Athlete = {
  id: string;
  name: string;
  email: string;
  status: 'invited' | 'active' | 'inactive';
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('athletes')
    .select('id, name, email, status, invited_at, accepted_at, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) notFound();
  const athlete = data as Athlete;

  const recentLogs = await listRecentWorkoutLogs(id, 10);

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
    </div>
  );
}
