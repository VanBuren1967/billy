import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { getCurrentWeekCheckIn } from '@/lib/check-ins/get-current-week';
import { listOwnRecentCheckIns } from '@/lib/check-ins/list-own-recent';
import { CheckInForm } from './check-in-form';

export const metadata = { title: 'Check-in · Steele & Co.' };

export default async function CheckInPage() {
  await getCurrentAthlete();
  const { checkIn, weekStarting } = await getCurrentWeekCheckIn();
  const recent = await listOwnRecentCheckIns(6);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">Week of {weekStarting}</p>
        <h1 className="text-bone font-serif text-3xl">Weekly check-in</h1>
        <p className="text-bone-muted mt-2 text-sm">
          {checkIn ? `Last saved ${new Date(checkIn.updatedAt).toLocaleString()}` : 'Submit your numbers for this week.'}
        </p>
      </header>

      <CheckInForm initial={checkIn} />

      {recent.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-bone-muted text-xs tracking-widest uppercase">Past check-ins</h2>
          <ul className="border-hairline-strong border bg-[#16140f] divide-y divide-[#1a1814]">
            {recent.map((c) => (
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
        </section>
      )}
    </main>
  );
}
