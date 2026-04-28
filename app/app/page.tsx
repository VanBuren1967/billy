import Link from 'next/link';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { getActiveProgram } from '@/lib/athletes/get-active-program';
import { computeCurrentWeek, computeTodayDay } from '@/lib/athletes/program-time';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Today · Steele & Co.' };

export default async function AppDashboard() {
  const athlete = await getCurrentAthlete();
  const tree = await getActiveProgram();

  let completedDayIds = new Set<string>();
  if (tree) {
    const supabase = await createClient();
    const dayIdList = tree.days.map((d) => d.id);
    if (dayIdList.length > 0) {
      const { data: logs = [] } = await supabase
        .from('workout_logs')
        .select('program_day_id, status')
        .in('program_day_id', dayIdList)
        .eq('status', 'completed');
      completedDayIds = new Set((logs ?? []).map((l) => l.program_day_id));
    }
  }

  if (!tree) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16 text-center">
        <p className="text-gold text-xs tracking-widest uppercase">Welcome, {athlete.name}</p>
        <h1 className="text-bone font-serif text-3xl">No program assigned yet</h1>
        <p className="text-bone-muted">Your coach hasn&rsquo;t assigned you a program yet. Check back soon.</p>
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const currentWeek = computeCurrentWeek(tree.program.startDate, today, tree.program.totalWeeks);
  const todayDay = computeTodayDay(today);

  const todaysWorkout = tree.days.find(
    (d) => d.weekNumber === currentWeek && d.dayNumber === todayDay,
  );
  const thisWeekDays = tree.days
    .filter((d) => d.weekNumber === currentWeek)
    .sort((a, b) => a.dayNumber - b.dayNumber);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">Welcome back, {athlete.name}</p>
        <h1 className="text-bone font-serif text-3xl">{tree.program.name}</h1>
        <p className="text-bone-muted mt-2 text-xs">
          Week {currentWeek} of {tree.program.totalWeeks} · {tree.program.blockType}
        </p>
      </header>

      <section className="border-hairline-strong border bg-[#0c0c0c] p-6">
        <p className="text-gold text-xs tracking-widest uppercase">Today</p>
        {todaysWorkout ? (
          completedDayIds.has(todaysWorkout.id) ? (
            <>
              <h2 className="text-bone mt-2 font-serif text-2xl">{todaysWorkout.name}</h2>
              <p className="text-gold mt-2 text-sm tracking-widest uppercase">✓ Completed</p>
              <Link href={`/app/workout/${todaysWorkout.id}`} className="text-bone-faint mt-3 inline-block text-xs">
                Review →
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-bone mt-2 font-serif text-2xl">{todaysWorkout.name}</h2>
              <p className="text-bone-muted mt-2 text-sm">
                {tree.exercises.filter((e) => e.programDayId === todaysWorkout.id).length} exercises
              </p>
              <Link href={`/app/workout/${todaysWorkout.id}`}
                className="border-gold text-gold mt-4 inline-block border px-6 py-2 text-xs tracking-widest uppercase">
                Log workout →
              </Link>
            </>
          )
        ) : (
          <>
            <h2 className="text-bone mt-2 font-serif text-2xl">Rest day</h2>
            <p className="text-bone-muted mt-2 text-sm">No workout scheduled today. Recover well.</p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-bone-muted text-xs tracking-widest uppercase">This week</h2>
        <ul className="border-hairline-strong border divide-y divide-[#1a1814]">
          {thisWeekDays.map((d) => (
            <li key={d.id} className="flex items-baseline justify-between px-5 py-3">
              <div>
                <p className="text-bone-faint text-xs">Day {d.dayNumber}</p>
                <p className="text-bone font-serif text-lg">{d.name}</p>
              </div>
              <div className="flex items-center gap-3">
                {completedDayIds.has(d.id) && <span className="text-gold text-xs" aria-label="Completed">✓</span>}
                {d.dayNumber === todayDay && (
                  <span className="text-gold text-xs tracking-widest uppercase">Today</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Link
        href="/app/program"
        className="border-gold text-gold border self-start px-6 py-3 text-xs tracking-widest uppercase"
      >
        View full program
      </Link>
    </main>
  );
}
