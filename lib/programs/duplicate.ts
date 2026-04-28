import { randomUUID } from 'node:crypto';
import type { BlockType } from './schemas';

export type SourceProgram = {
  id: string;
  coach_id: string;
  athlete_id: string | null;
  name: string;
  block_type: BlockType;
  total_weeks: number;
  notes: string | null;
  start_date: string | null;
  end_date: string | null;
  is_template: boolean;
  is_active: boolean;
  version: number;
  created_at: string;
};

export type SourceDay = {
  id: string;
  program_id: string;
  week_number: number;
  day_number: number;
  name: string;
  notes: string | null;
};

export type SourceExercise = {
  id: string;
  program_day_id: string;
  position: number;
  name: string;
  sets: number;
  reps: string;
  load_pct: number | null;
  load_lbs: number | null;
  rpe: number | null;
  group_label: string | null;
  notes: string | null;
};

export type DeepCopyOverrides = {
  coachId: string;
  athleteId?: string | null;
  isTemplate: boolean;
  startDate?: string | null;
  endDate?: string | null;
  name?: string;
};

export type DeepCopyPayload = {
  program: Omit<SourceProgram, 'created_at'> & { created_at?: undefined };
  days: SourceDay[];
  exercises: SourceExercise[];
};

/**
 * Build the inserts for a deep-copy of a program.
 *
 * Pure function — no DB calls. The caller wraps the returned payload in
 * a transactional insert (a single Postgres function call or three
 * sequential inserts) and applies it via the supabase client.
 */
export function buildDeepCopyPayload(
  source: SourceProgram,
  sourceDays: SourceDay[],
  sourceExercises: SourceExercise[],
  ov: DeepCopyOverrides,
): DeepCopyPayload {
  const newProgramId = randomUUID();

  // Map old day id → new day id so we can rewrite exercise.program_day_id.
  const dayIdMap = new Map<string, string>();
  const days: SourceDay[] = sourceDays
    .slice()
    .sort((a, b) =>
      a.week_number - b.week_number || a.day_number - b.day_number,
    )
    .map((d) => {
      const id = randomUUID();
      dayIdMap.set(d.id, id);
      return {
        id,
        program_id: newProgramId,
        week_number: d.week_number,
        day_number: d.day_number,
        name: d.name,
        notes: d.notes,
      };
    });

  const exercises: SourceExercise[] = sourceExercises
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((e) => ({
      id: randomUUID(),
      program_day_id: dayIdMap.get(e.program_day_id)!,
      position: e.position,
      name: e.name,
      sets: e.sets,
      reps: e.reps,
      load_pct: e.load_pct,
      load_lbs: e.load_lbs,
      rpe: e.rpe,
      group_label: e.group_label,
      notes: e.notes,
    }));

  return {
    program: {
      id: newProgramId,
      coach_id: ov.coachId,
      athlete_id: ov.athleteId ?? null,
      name: ov.name ?? source.name,
      block_type: source.block_type,
      total_weeks: source.total_weeks,
      notes: source.notes,
      start_date: ov.startDate ?? null,
      end_date: ov.endDate ?? null,
      is_template: ov.isTemplate,
      is_active: true,
      version: 1, // reset version on a fresh copy
      created_at: undefined,
    },
    days,
    exercises,
  };
}
