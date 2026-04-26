'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { inviteSchema } from '@/lib/validation/invite';
import { assertCoach, NotCoachError } from '@/lib/coach/assert-coach';
import { inviteAthlete } from '@/lib/coach/invite-athlete';

export type DirectInviteState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string; fields?: { name?: string; email?: string } };

export async function directInviteAthlete(
  _prev: DirectInviteState,
  formData: FormData,
): Promise<DirectInviteState> {
  let coachId: string;
  try {
    ({ coachId } = await assertCoach());
  } catch (e) {
    if (e instanceof NotCoachError) {
      return { kind: 'error', message: 'You must be signed in as a coach.' };
    }
    throw e;
  }

  const parsed = inviteSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      kind: 'error',
      message: 'Please correct the highlighted fields.',
      fields: {
        name: flat.fieldErrors.name?.[0],
        email: flat.fieldErrors.email?.[0],
      },
    };
  }

  const result = await inviteAthlete({
    coachId,
    name: parsed.data.name,
    email: parsed.data.email,
  });
  if (!result.ok) {
    return { kind: 'error', message: result.message };
  }

  revalidatePath('/coach/athletes');
  revalidatePath('/coach');
  redirect('/coach/athletes');
}
