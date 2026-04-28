import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from './get-current-athlete';

export type ActiveProgramTree = {
  program: {
    id: string;
    name: string;
    blockType: 'hypertrophy' | 'strength' | 'peak' | 'general';
    totalWeeks: number;
    startDate: string | null;
    endDate: string | null;
    notes: string | null;
    isActive: boolean;
  };
  days: {
    id: string;
    weekNumber: number;
    dayNumber: number;
    name: string;
    notes: string | null;
  }[];
  exercises: {
    id: string;
    programDayId: string;
    position: number;
    name: string;
    sets: number;
    reps: string;
    loadPct: number | null;
    loadLbs: number | null;
    rpe: number | null;
    groupLabel: string | null;
    notes: string | null;
  }[];
};

/**
 * Fetch the athlete's currently-active assigned program tree (program + days +
 * exercises). Returns null if no active program is assigned.
 *
 * "Active" = is_template=false AND is_active=true AND athlete_id = me.
 * Multiple actives → most recently created wins.
 */
export async function getActiveProgram(): Promise<ActiveProgramTree | null> {
  await getCurrentAthlete();
  const supabase = await createClient();

  const { data: programs } = await supabase
    .from('programs')
    .select('id, name, block_type, total_weeks, start_date, end_date, notes, is_active')
    .eq('is_template', false)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!programs || programs.length === 0) return null;
  const program = programs[0]!;

  const { data: days = [] } = await supabase
    .from('program_days')
    .select('id, week_number, day_number, name, notes')
    .eq('program_id', program.id)
    .order('week_number')
    .order('day_number');

  const dayIds = (days ?? []).map((d) => d.id);
  let exercises: ActiveProgramTree['exercises'] = [];
  if (dayIds.length > 0) {
    const { data = [] } = await supabase
      .from('program_exercises')
      .select('id, program_day_id, position, name, sets, reps, load_pct, load_lbs, rpe, group_label, notes')
      .in('program_day_id', dayIds)
      .order('group_label', { ascending: true, nullsFirst: false })
      .order('position');
    exercises = (data ?? []).map((e) => ({
      id: e.id, programDayId: e.program_day_id, position: e.position, name: e.name,
      sets: e.sets, reps: e.reps, loadPct: e.load_pct, loadLbs: e.load_lbs,
      rpe: e.rpe, groupLabel: e.group_label, notes: e.notes,
    }));
  }

  return {
    program: {
      id: program.id, name: program.name,
      blockType: program.block_type as ActiveProgramTree['program']['blockType'],
      totalWeeks: program.total_weeks,
      startDate: program.start_date, endDate: program.end_date,
      notes: program.notes, isActive: program.is_active,
    },
    days: (days ?? []).map((d) => ({
      id: d.id, weekNumber: d.week_number, dayNumber: d.day_number,
      name: d.name, notes: d.notes,
    })),
    exercises,
  };
}
