'use server';

import { redirect } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { joinRequestSchema } from '@/lib/validation/join-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/resend';
import { requestReceivedEmail } from '@/lib/email/templates/request-received';

export type SubmitJoinRequestState =
  | { kind: 'idle' }
  | {
      kind: 'error';
      message: string;
      fields?: { name?: string; email?: string; message?: string };
    };

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

  const admin = createAdminClient();
  const { error } = await admin.from('join_requests').insert({
    name: parsed.data.name,
    email: parsed.data.email,
    message: parsed.data.message || null,
  });

  // 23505 = duplicate pending request for this email (see migration 0016).
  // Treat as idempotent success: the prospect's earlier submission is in the
  // queue, no need to insert a second row or send a second confirmation email.
  const isDuplicate = error?.code === '23505';
  if (error && !isDuplicate) {
    return { kind: 'error', message: 'Something went wrong. Please try again.' };
  }

  if (!isDuplicate) {
    try {
      const tpl = requestReceivedEmail(parsed.data.name);
      await sendEmail({ to: parsed.data.email, ...tpl });
    } catch (e) {
      Sentry.captureException(e, {
        tags: { feature: 'request-to-join', stage: 'confirmation_email' },
      });
    }
  }

  redirect('/request-to-join/thanks');
}
