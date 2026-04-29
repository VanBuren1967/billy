import { z } from 'zod';

export const getOrCreateWorkoutLogSchema = z.object({
  programDayId: z.string().uuid(),
});
export type GetOrCreateWorkoutLogInput = z.infer<typeof getOrCreateWorkoutLogSchema>;

export const saveSetLogSchema = z.object({
  setLogId: z.string().uuid(),
  weightLbs: z.number().min(0).max(2500).optional().nullable(),
  repsDone: z.number().int().min(0).max(200).optional().nullable(),
  rpe: z.number().min(0).max(10).optional().nullable(),
  completed: z.boolean().optional(),
});
export type SaveSetLogInput = z.infer<typeof saveSetLogSchema>;

export const saveWorkoutNotesSchema = z.object({
  workoutLogId: z.string().uuid(),
  painNotes: z.string().trim().max(2000).optional().nullable(),
  generalNotes: z.string().trim().max(2000).optional().nullable(),
});
export type SaveWorkoutNotesInput = z.infer<typeof saveWorkoutNotesSchema>;

export const markWorkoutCompleteSchema = z.object({
  workoutLogId: z.string().uuid(),
});
export type MarkWorkoutCompleteInput = z.infer<typeof markWorkoutCompleteSchema>;
