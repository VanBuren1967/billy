import { z } from 'zod';

export const saveCheckInSchema = z.object({
  bodyweightLbs: z.number().min(50).max(700),
  fatigue: z.number().int().min(1).max(10),
  soreness: z.number().int().min(1).max(10),
  confidence: z.number().int().min(1).max(10),
  motivation: z.number().int().min(1).max(10),
  meetReadiness: z.number().int().min(1).max(10).optional().nullable(),
  painNotes: z.string().trim().max(2000).optional().nullable(),
  comments: z.string().trim().max(2000).optional().nullable(),
});
export type SaveCheckInInput = z.infer<typeof saveCheckInSchema>;
