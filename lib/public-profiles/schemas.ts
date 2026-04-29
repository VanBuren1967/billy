import { z } from 'zod';

const meetResultSchema = z.object({
  meet: z.string().trim().min(1).max(120),
  date: z.string().date(),
  total_lbs: z.number().min(0).max(2500),
  placement: z.string().trim().max(20).optional().nullable(),
});

export const savePublicProfileSchema = z.object({
  headline: z.string().trim().min(1).max(120),
  bio: z.string().trim().min(1).max(4000),
  photoUrl: z.string().trim().url().max(500).optional().nullable(),
  recentMeetResults: z.array(meetResultSchema).max(10),
});
export type SavePublicProfileInput = z.infer<typeof savePublicProfileSchema>;
