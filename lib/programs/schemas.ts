import { z } from 'zod';

export const blockTypeSchema = z.enum(['hypertrophy', 'strength', 'peak', 'general']);
export type BlockType = z.infer<typeof blockTypeSchema>;

const uuid = z.string().uuid();
const optionalDate = z.string().date().optional().nullable();

export const createProgramSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('blank'),
    name: z.string().min(1).max(120),
    blockType: blockTypeSchema,
    totalWeeks: z.number().int().min(1).max(52),
    notes: z.string().max(2000).optional().nullable(),
    isTemplate: z.boolean().default(false),
    athleteId: uuid.optional().nullable(),
    startDate: optionalDate,
  }),
  z.object({
    mode: z.literal('duplicate_template'),
    sourceProgramId: uuid,
  }),
  z.object({
    mode: z.literal('duplicate_program'),
    sourceProgramId: uuid,
  }),
]);
export type CreateProgramInput = z.infer<typeof createProgramSchema>;

export const saveProgramHeaderSchema = z.object({
  programId: uuid,
  programVersion: z.number().int().min(1),
  name: z.string().min(1).max(120),
  blockType: blockTypeSchema,
  totalWeeks: z.number().int().min(1).max(52),
  startDate: optionalDate,
  endDate: optionalDate,
  notes: z.string().max(2000).optional().nullable(),
});
export type SaveProgramHeaderInput = z.infer<typeof saveProgramHeaderSchema>;

export const saveProgramDaySchema = z.object({
  programDayId: uuid,
  programVersion: z.number().int().min(1),
  weekNumber: z.number().int().min(1),
  dayNumber: z.number().int().min(1),
  name: z.string().min(1).max(120),
  notes: z.string().max(500).optional().nullable(),
});
export type SaveProgramDayInput = z.infer<typeof saveProgramDaySchema>;

export const saveProgramExerciseSchema = z.object({
  programExerciseId: uuid,
  programVersion: z.number().int().min(1),
  name: z.string().min(1).max(120),
  sets: z.number().int().min(1).max(50),
  reps: z.string().min(1).max(40),
  loadPct: z.number().min(0).max(150).optional().nullable(),
  loadLbs: z.number().min(0).max(2500).optional().nullable(),
  rpe: z.number().min(0).max(10).optional().nullable(),
  groupLabel: z.string().min(1).max(20).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});
export type SaveProgramExerciseInput = z.infer<typeof saveProgramExerciseSchema>;

export const addProgramDaySchema = z.object({
  programId: uuid,
  programVersion: z.number().int().min(1),
  weekNumber: z.number().int().min(1),
});
export type AddProgramDayInput = z.infer<typeof addProgramDaySchema>;

export const addProgramExerciseSchema = z.object({
  programDayId: uuid,
  programVersion: z.number().int().min(1),
});
export type AddProgramExerciseInput = z.infer<typeof addProgramExerciseSchema>;

export const removeProgramDaySchema = z.object({
  programDayId: uuid,
  programVersion: z.number().int().min(1),
});
export const removeProgramExerciseSchema = z.object({
  programExerciseId: uuid,
  programVersion: z.number().int().min(1),
});

export const reorderSchema = z.object({
  id: uuid,
  programVersion: z.number().int().min(1),
  direction: z.enum(['up', 'down']),
});
export type ReorderInput = z.infer<typeof reorderSchema>;

export const assignProgramSchema = z.object({
  templateProgramId: uuid,
  athleteId: uuid,
  startDate: z.string().date(),
});
export type AssignProgramInput = z.infer<typeof assignProgramSchema>;

export const archiveProgramSchema = z.object({
  programId: uuid,
});
export type ArchiveProgramInput = z.infer<typeof archiveProgramSchema>;
