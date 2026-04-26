'use server';

import { redirect } from 'next/navigation';
import { joinRequestSchema } from '@/lib/validation/join-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/resend';
import { requestReceivedEmail } from '@/lib/email/templates/request-received';

export type SubmitJoinRequestState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string; fields?: { name?: string; email?: string; message?: string } };

export async function submitJoinRequest(
  _prev: SubmitJoinRequestState,
  formData: FormData,
): Promise<SubmitJoinRequestState> {
  const parsed = joinRequestSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    message: formData.get('message') ?? '',
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      kind: 'error',
      message: 'Please correct the highlighted fields.',
      fields: {
        name: flat.fieldErrors.name?.[0],
        email: flat.fieldErrors.email?.[0],
        message: flat.fieldErrors.message?.[0],
      },
    };
  }

  // Use the admin client because the public form is unauthenticated; the RLS
  // policy already permits inserts from `anon`, but using the admin client here
  // sidesteps cookie/anon-session edge cases.
  const admin = createAdminClient();
  const { error } = await admin.from('join_requests').insert({
    name: parsed.data.name,
    email: parsed.data.email,
    message: parsed.data.message || null,
  });
  if (error) {
    return { kind: 'error', message: 'Something went wrong. Please try again.' };
  }

  try {
    const tpl = requestReceivedEmail(parsed.data.name);
    await sendEmail({ to: parsed.data.email, ...tpl });
  } catch (e) {
    console.error('[request-to-join] confirmation email failed', e);
  }

  redirect('/request-to-join/thanks');
}
