import { z } from 'zod';

export const athleteProfileSchema = z.object({
  athleteId: z.string().uuid(),
  weightClass: z.string().max(20).optional().nullable(),
  rawOrEquipped: z.enum(['raw', 'equipped']).optional().nullable(),
  currentSquatMax: z.number().min(0).max(2500).optional().nullable(),
  currentBenchMax: z.number().min(0).max(2500).optional().nullable(),
  currentDeadliftMax: z.number().min(0).max(2500).optional().nullable(),
  weakPoints: z.string().max(2000).optional().nullable(),
  injuryHistory: z.string().max(4000).optional().nullable(),
  experienceLevel: z.string().max(60).optional().nullable(),
  goal: z.enum(['hypertrophy', 'strength', 'meet_prep', 'general']).optional().nullable(),
  meetDate: z.string().date().optional().nullable(),
  meetName: z.string().max(120).optional().nullable(),
  coachingType: z.enum(['hybrid', 'online']).optional().nullable(),
});
export type AthleteProfileInput = z.infer<typeof athleteProfileSchema>;
