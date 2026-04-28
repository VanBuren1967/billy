import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';
import { ProgramBuilder } from './program-builder';
import type { BuilderData } from './types';

export default async function ProgramEditPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: p } = await supabase.from('programs')
    .select(`
      id, name, block_type, total_weeks, start_date, end_date, notes,
      is_template, athlete_id, version,
      athlete:athletes(id, name)
    `).eq('id', id).maybeSingle();
  if (!p) notFound();

  const { data: days = [] } = await supabase.from('program_days')
    .select('id, week_number, day_number, name, notes')
    .eq('program_id', id)
    .order('week_number').order('day_number');

  const dayIds = (days ?? []).map((d) => d.id);
  let exercises: BuilderData['exercises'] = [];
  if (dayIds.length > 0) {
    const { data = [] } = await supabase.from('program_exercises')
      .select('id, program_day_id, position, name, sets, reps, load_pct, load_lbs, rpe, group_label, notes')
      .in('program_day_id', dayIds)
      .order('group_label', { ascending: true, nullsFirst: false })
      .order('position');
    exercises = (data ?? []).map((e) => ({
      id: e.id, programDayId: e.program_day_id, position: e.position, name: e.name,
      sets: e.sets, reps: e.reps, loadPct: e.load_pct, loadLbs: e.load_lbs, rpe: e.rpe,
      groupLabel: e.group_label, notes: e.notes,
    }));
  }

  const data: BuilderData = {
    program: {
      id: p.id, name: p.name, blockType: p.block_type as BuilderData['program']['blockType'],
      totalWeeks: p.total_weeks, startDate: p.start_date, endDate: p.end_date,
      notes: p.notes, isTemplate: p.is_template, athleteId: p.athlete_id,
      athleteName: (p.athlete as unknown as { name: string } | null)?.name ?? null,
      version: p.version,
    },
    days: (days ?? []).map((d) => ({
      id: d.id, weekNumber: d.week_number, dayNumber: d.day_number,
      name: d.name, notes: d.notes,
    })),
    exercises,
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <ProgramBuilder data={data} />
    </div>
  );
}
