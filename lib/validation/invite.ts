import { z } from 'zod';

export const inviteSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email.'),
});

export type InviteInput = z.infer<typeof inviteSchema>;
