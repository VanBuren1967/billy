import { describe, it, expect } from 'vitest';
import { saveSetLogSchema, saveWorkoutNotesSchema } from '@/lib/workouts/schemas';

describe('saveSetLogSchema', () => {
  it('accepts a valid set save', () => {
    const r = saveSetLogSchema.safeParse({
      setLogId: '00000000-0000-0000-0000-000000000000',
      weightLbs: 225, repsDone: 5, rpe: 7, completed: true,
    });
    expect(r.success).toBe(true);
  });
  it('rejects rpe > 10', () => {
    const r = saveSetLogSchema.safeParse({
      setLogId: '00000000-0000-0000-0000-000000000000', rpe: 11,
    });
    expect(r.success).toBe(false);
  });
  it('rejects negative reps', () => {
    const r = saveSetLogSchema.safeParse({
      setLogId: '00000000-0000-0000-0000-000000000000', repsDone: -1,
    });
    expect(r.success).toBe(false);
  });
  it('accepts high reps (AMRAP-style)', () => {
    const r = saveSetLogSchema.safeParse({
      setLogId: '00000000-0000-0000-0000-000000000000', repsDone: 35,
    });
    expect(r.success).toBe(true);
  });
});

describe('saveWorkoutNotesSchema', () => {
  it('accepts both note fields', () => {
    const r = saveWorkoutNotesSchema.safeParse({
      workoutLogId: '00000000-0000-0000-0000-000000000000',
      painNotes: 'mild left knee', generalNotes: 'felt strong',
    });
    expect(r.success).toBe(true);
  });
  it('caps notes at 2000 chars', () => {
    const r = saveWorkoutNotesSchema.safeParse({
      workoutLogId: '00000000-0000-0000-0000-000000000000',
      painNotes: 'x'.repeat(2001),
    });
    expect(r.success).toBe(false);
  });
});
