'use server';

import { revalidatePath } from 'next/cache';
import { assertCoach } from '@/lib/coach/assert-coach';
import { createAdminClient } from '@/lib/supabase/admin';
import { inviteAthlete } from '@/lib/coach/invite-athlete';

export async function approveJoinRequest(formData: FormData): Promise<void> {
  const requestId = formData.get('requestId');
  if (typeof requestId !== 'string' || !requestId) {
    throw new Error('Missing request id.');
  }

  const { coachId } = await assertCoach();
  const admin = createAdminClient();

  const { data: req, error: reqErr } = await admin
    .from('join_requests')
    .select('id, name, email, status')
    .eq('id', requestId)
    .maybeSingle();
  if (reqErr || !req) throw new Error('Request not found.');
  if (req.status !== 'pending') {
    throw new Error(`Request is already ${req.status}.`);
  }

  const result = await inviteAthlete({ coachId, name: req.name, email: req.email });
  if (!result.ok) {
    throw new Error(result.message);
  }

  const { error: updateErr } = await admin
    .from('join_requests')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by_coach_id: coachId,
    })
    .eq('id', requestId);
  if (updateErr) throw new Error(updateErr.message);

  revalidatePath('/coach/requests');
  revalidatePath('/coach/athletes');
  revalidatePath('/coach');
}

export async function declineJoinRequest(formData: FormData): Promise<void> {
  const requestId = formData.get('requestId');
  if (typeof requestId !== 'string' || !requestId) {
    throw new Error('Missing request id.');
  }

  const { coachId } = await assertCoach();
  const admin = createAdminClient();
  const { error } = await admin
    .from('join_requests')
    .update({
      status: 'declined',
      reviewed_at: new Date().toISOString(),
      reviewed_by_coach_id: coachId,
    })
    .eq('id', requestId)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);

  revalidatePath('/coach/requests');
  revalidatePath('/coach');
}
