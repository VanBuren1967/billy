import { describe, it, expect } from 'vitest';
import { buildDeepCopyPayload } from '@/lib/programs/duplicate';

const sourceProgram = {
  id: 'p1', coach_id: 'c1', name: 'Base', block_type: 'strength' as const,
  total_weeks: 4, notes: null, is_template: true, is_active: true, version: 3,
  start_date: null, end_date: null, athlete_id: null, created_at: '2026-01-01',
};
const sourceDays = [
  { id: 'd1', program_id: 'p1', week_number: 1, day_number: 1, name: 'Squat', notes: null },
  { id: 'd2', program_id: 'p1', week_number: 1, day_number: 2, name: 'Bench', notes: null },
];
const sourceExercises = [
  { id: 'e1', program_day_id: 'd1', position: 1, name: 'Squat', sets: 5, reps: '5',
    load_pct: 75, load_lbs: null, rpe: 7, group_label: null, notes: null },
  { id: 'e2', program_day_id: 'd1', position: 2, name: 'RDL', sets: 3, reps: '8',
    load_pct: null, load_lbs: 185, rpe: null, group_label: 'A', notes: null },
];

describe('buildDeepCopyPayload', () => {
  it('clones into a new program with override fields applied', () => {
    const out = buildDeepCopyPayload(sourceProgram, sourceDays, sourceExercises, {
      coachId: 'c1', athleteId: 'a1', isTemplate: false,
      startDate: '2026-05-01', name: 'Assigned to Athlete', endDate: '2026-05-29',
    });
    expect(out.program.coach_id).toBe('c1');
    expect(out.program.athlete_id).toBe('a1');
    expect(out.program.is_template).toBe(false);
    expect(out.program.is_active).toBe(true);
    expect(out.program.version).toBe(1); // reset
    expect(out.program.name).toBe('Assigned to Athlete');
    expect(out.program.start_date).toBe('2026-05-01');
    expect(out.program.end_date).toBe('2026-05-29');
  });

  it('preserves day order and clones day rows with new program_id', () => {
    const out = buildDeepCopyPayload(sourceProgram, sourceDays, sourceExercises, {
      coachId: 'c1', isTemplate: true,
    });
    expect(out.days.length).toBe(2);
    expect(out.days[0]!.week_number).toBe(1);
    expect(out.days[0]!.day_number).toBe(1);
    expect(out.days[1]!.week_number).toBe(1);
    expect(out.days[1]!.day_number).toBe(2);
  });

  it('preserves group_label and position on exercises', () => {
    const out = buildDeepCopyPayload(sourceProgram, sourceDays, sourceExercises, {
      coachId: 'c1', isTemplate: true,
    });
    const cloneE2 = out.exercises.find((e) => e.name === 'RDL');
    expect(cloneE2?.group_label).toBe('A');
    expect(cloneE2?.position).toBe(2);
    expect(cloneE2?.load_lbs).toBe(185);
  });

  it('regenerates ids — no source ids leak through', () => {
    const out = buildDeepCopyPayload(sourceProgram, sourceDays, sourceExercises, {
      coachId: 'c1', isTemplate: true,
    });
    const allNewIds = [
      out.program.id,
      ...out.days.map((d) => d.id),
      ...out.exercises.map((e) => e.id),
    ];
    const sourceIds = ['p1', 'd1', 'd2', 'e1', 'e2'];
    for (const id of sourceIds) {
      expect(allNewIds).not.toContain(id);
    }
  });

  it('rewires exercise.program_day_id to the new day rows', () => {
    const out = buildDeepCopyPayload(sourceProgram, sourceDays, sourceExercises, {
      coachId: 'c1', isTemplate: true,
    });
    const newDayId = out.days[0]!.id;
    const exsForDay1 = out.exercises.filter((e) => e.program_day_id === newDayId);
    expect(exsForDay1.length).toBe(2);
    expect(out.exercises.some((e) => e.program_day_id === 'd1')).toBe(false);
  });
});
