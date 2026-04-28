import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { getOrCreateWorkoutLog } from '@/lib/workouts/get-or-create-workout-log';
import { WorkoutLogger } from './workout-logger';

export default async function WorkoutPage({
  params,
}: { params: Promise<{ program_day_id: string }> }) {
  const { program_day_id } = await params;
  await getCurrentAthlete();
  const supabase = await createClient();

  const { data: day } = await supabase
    .from('program_days')
    .select('id, week_number, day_number, name, program_id, programs(name)')
    .eq('id', program_day_id)
    .maybeSingle();
  if (!day) notFound();

  const { data: exercises = [] } = await supabase
    .from('program_exercises')
    .select('id, position, name, sets, reps, load_pct, load_lbs, rpe, group_label, notes')
    .eq('program_day_id', program_day_id)
    .order('position');

  const tree = await getOrCreateWorkoutLog(program_day_id);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">
          Week {day.week_number} · Day {day.day_number}
        </p>
        <h1 className="text-bone font-serif text-3xl">{day.name}</h1>
        <p className="text-bone-muted text-xs">
          {(day.programs as unknown as { name: string } | null)?.name ?? ''}
        </p>
      </header>
      <WorkoutLogger
        workoutLog={tree.log}
        sets={tree.sets}
        exercises={(exercises ?? []).map((e) => ({
          id: e.id, position: e.position, name: e.name, sets: e.sets, reps: e.reps,
          loadPct: e.load_pct, loadLbs: e.load_lbs, rpe: e.rpe, groupLabel: e.group_label,
        }))}
      />
    </main>
  );
}
