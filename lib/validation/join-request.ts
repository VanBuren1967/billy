import { z } from 'zod';

export const joinRequestSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email.'),
  message: z.string().trim().max(2000).optional().or(z.literal('')),
});

export type JoinRequestInput = z.infer<typeof joinRequestSchema>;
