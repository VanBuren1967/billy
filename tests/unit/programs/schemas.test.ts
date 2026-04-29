import { describe, it, expect } from 'vitest';
import {
  createProgramSchema,
  saveProgramExerciseSchema,
  saveProgramHeaderSchema,
} from '@/lib/programs/schemas';

describe('createProgramSchema', () => {
  it('accepts a valid blank program', () => {
    const r = createProgramSchema.safeParse({
      mode: 'blank',
      name: 'Strength block 1',
      blockType: 'strength',
      totalWeeks: 12,
      isTemplate: false,
    });
    expect(r.success).toBe(true);
  });

  it('rejects totalWeeks > 52', () => {
    const r = createProgramSchema.safeParse({
      mode: 'blank',
      name: 'Bad',
      blockType: 'strength',
      totalWeeks: 53,
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown blockType', () => {
    const r = createProgramSchema.safeParse({
      mode: 'blank',
      name: 'X',
      blockType: 'cardio',
      totalWeeks: 4,
    });
    expect(r.success).toBe(false);
  });

  it('accepts duplicate_template mode with sourceProgramId', () => {
    const r = createProgramSchema.safeParse({
      mode: 'duplicate_template',
      sourceProgramId: '00000000-0000-0000-0000-000000000000',
    });
    expect(r.success).toBe(true);
  });
});

describe('saveProgramExerciseSchema', () => {
  it('accepts AMRAP rep text', () => {
    const r = saveProgramExerciseSchema.safeParse({
      programExerciseId: '00000000-0000-0000-0000-000000000000',
      programVersion: 1,
      name: 'Squat',
      sets: 4,
      reps: 'AMRAP @ RPE 9',
    });
    expect(r.success).toBe(true);
  });

  it('accepts cluster shorthand "3+1+1" in reps', () => {
    const r = saveProgramExerciseSchema.safeParse({
      programExerciseId: '00000000-0000-0000-0000-000000000000',
      programVersion: 2,
      name: 'Squat',
      sets: 5,
      reps: '3+1+1',
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty reps', () => {
    const r = saveProgramExerciseSchema.safeParse({
      programExerciseId: '00000000-0000-0000-0000-000000000000',
      programVersion: 1,
      name: 'Squat',
      sets: 5,
      reps: '',
    });
    expect(r.success).toBe(false);
  });

  it('caps groupLabel length at 20', () => {
    const r = saveProgramExerciseSchema.safeParse({
      programExerciseId: '00000000-0000-0000-0000-000000000000',
      programVersion: 1,
      name: 'Squat',
      sets: 5,
      reps: '5',
      groupLabel: 'a'.repeat(21),
    });
    expect(r.success).toBe(false);
  });

  it('rejects rpe > 10', () => {
    const r = saveProgramExerciseSchema.safeParse({
      programExerciseId: '00000000-0000-0000-0000-000000000000',
      programVersion: 1,
      name: 'Squat',
      sets: 5,
      reps: '5',
      rpe: 11,
    });
    expect(r.success).toBe(false);
  });
});

describe('saveProgramHeaderSchema', () => {
  it('accepts minimal valid update', () => {
    const r = saveProgramHeaderSchema.safeParse({
      programId: '00000000-0000-0000-0000-000000000000',
      programVersion: 1,
      name: 'Renamed',
      blockType: 'peak',
      totalWeeks: 8,
    });
    expect(r.success).toBe(true);
  });

  it('trims leading/trailing whitespace on free-text fields before storing', () => {
    const r = saveProgramHeaderSchema.safeParse({
      programId: '00000000-0000-0000-0000-000000000000',
      programVersion: 1,
      name: '  Hypertrophy block  ',
      blockType: 'hypertrophy',
      totalWeeks: 8,
      notes: '\n  remember to deload  \n',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe('Hypertrophy block');
      expect(r.data.notes).toBe('remember to deload');
    }
  });

  it('rejects names that are entirely whitespace', () => {
    const r = saveProgramHeaderSchema.safeParse({
      programId: '00000000-0000-0000-0000-000000000000',
      programVersion: 1,
      name: '   ',
      blockType: 'strength',
      totalWeeks: 4,
    });
    expect(r.success).toBe(false);
  });
});
