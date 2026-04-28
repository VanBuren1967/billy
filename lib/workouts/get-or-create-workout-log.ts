import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { workoutBreadcrumb } from './breadcrumbs';

export type WorkoutLogTree = {
  log: {
    id: string;
    athleteId: string;
    programDayId: string;
    status: 'in_progress' | 'completed' | 'skipped';
    completedAt: string | null;
    painNotes: string | null;
    generalNotes: string | null;
  };
  sets: {
    id: string;
    programExerciseId: string;
    setNumber: number;
    weightLbs: number | null;
    repsDone: number | null;
    rpe: number | null;
    completed: boolean;
  }[];
};

const GENERIC_DB_ERROR = 'Failed to load workout. Please try again.';

function maskDbError(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`getOrCreateWorkoutLog.${operation}: ${error.message}`));
  return new Error(GENERIC_DB_ERROR);
}

export async function getOrCreateWorkoutLog(programDayId: string): Promise<WorkoutLogTree> {
  const athlete = await getCurrentAthlete();
  const supabase = await createClient();

  const { data: dayRow, error: dayErr } = await supabase
    .from('program_days')
    .select('id, program_id')
    .eq('id', programDayId)
    .maybeSingle();
  if (dayErr) throw maskDbError('day_lookup', dayErr);
  if (!dayRow) throw new Error('program_day not accessible');

  const { data: existing, error: lookupErr } = await supabase
    .from('workout_logs')
    .select('id, athlete_id, program_day_id, status, completed_at, pain_notes, general_notes')
    .eq('athlete_id', athlete.id)
    .eq('program_day_id', programDayId)
    .maybeSingle();
  if (lookupErr) throw maskDbError('log_lookup', lookupErr);

  let logRow = existing;
  let isNew = false;
  if (!logRow) {
    isNew = true;
    const { data: created, error: createErr } = await supabase
      .from('workout_logs')
      .insert({ athlete_id: athlete.id, program_day_id: programDayId, status: 'in_progress' })
      .select('id, athlete_id, program_day_id, status, completed_at, pain_notes, general_notes')
      .single();
    if (createErr || !created) throw maskDbError('log_insert', createErr ?? { message: 'no row' });
    logRow = created;

    const { data: exercises, error: exErr } = await supabase
      .from('program_exercises')
      .select('id, sets, position')
      .eq('program_day_id', programDayId)
      .order('position');
    if (exErr) throw maskDbError('exercises_lookup', exErr);

    const rows: { workout_log_id: string; program_exercise_id: string; set_number: number }[] = [];
    for (const ex of exercises ?? []) {
      for (let n = 1; n <= ex.sets; n++) {
        rows.push({ workout_log_id: created.id, program_exercise_id: ex.id, set_number: n });
      }
    }
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('set_logs').insert(rows);
      if (insErr) throw maskDbError('set_logs_insert', insErr);
    }
  }

  const { data: sets = [], error: setsErr } = await supabase
    .from('set_logs')
    .select('id, program_exercise_id, set_number, weight_lbs, reps_done, rpe, completed')
    .eq('workout_log_id', logRow!.id)
    .order('program_exercise_id')
    .order('set_number');
  if (setsErr) throw maskDbError('sets_select', setsErr);

  if (isNew) {
    workoutBreadcrumb('workout.started', {
      workout_log_id: logRow!.id, program_day_id: programDayId, athlete_id: athlete.id,
    });
  }

  return {
    log: {
      id: logRow!.id, athleteId: logRow!.athlete_id, programDayId: logRow!.program_day_id,
      status: logRow!.status as 'in_progress' | 'completed' | 'skipped',
      completedAt: logRow!.completed_at, painNotes: logRow!.pain_notes,
      generalNotes: logRow!.general_notes,
    },
    sets: (sets ?? []).map((s) => ({
      id: s.id, programExerciseId: s.program_exercise_id, setNumber: s.set_number,
      weightLbs: s.weight_lbs, repsDone: s.reps_done, rpe: s.rpe, completed: s.completed,
    })),
  };
}
