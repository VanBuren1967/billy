import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type InviteAthleteArgs = {
  coachId: string;
  name: string;
  email: string;
};

export type InviteAthleteResult =
  | { ok: true; athleteId: string; alreadyExisted: boolean }
  | { ok: false; reason: 'duplicate_active' | 'invite_failed'; message: string };

/**
 * Create an athletes row (or reuse an existing 'invited' one) for the given email
 * under this coach, then trigger Supabase to send the magic-link invite email.
 *
 * Idempotency:
 * - If an athletes row with this (coach_id, email) exists with status='invited' or
 *   status='inactive', we resend the invite.
 * - If status='active', we return { ok: false, reason: 'duplicate_active' } — the
 *   caller (UI) decides what to tell the coach.
 */
export async function inviteAthlete(
  args: InviteAthleteArgs,
): Promise<InviteAthleteResult> {
  const admin = createAdminClient();
  const email = args.email.trim().toLowerCase();

  const { data: existing, error: lookupErr } = await admin
    .from('athletes')
    .select('id, status')
    .eq('coach_id', args.coachId)
    .eq('email', email)
    .maybeSingle();
  if (lookupErr) {
    return { ok: false, reason: 'invite_failed', message: lookupErr.message };
  }

  let athleteId: string;
  let alreadyExisted = false;

  if (existing) {
    if (existing.status === 'active') {
      return {
        ok: false,
        reason: 'duplicate_active',
        message: 'This athlete is already active.',
      };
    }
    athleteId = existing.id;
    alreadyExisted = true;
    const { error: updateErr } = await admin
      .from('athletes')
      .update({
        name: args.name,
        status: 'invited',
        invited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', athleteId);
    if (updateErr) {
      return { ok: false, reason: 'invite_failed', message: updateErr.message };
    }
  } else {
    const { data: inserted, error: insertErr } = await admin
      .from('athletes')
      .insert({
        coach_id: args.coachId,
        name: args.name,
        email,
        is_active: true,
        status: 'invited',
        invited_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (insertErr || !inserted) {
      return {
        ok: false,
        reason: 'invite_failed',
        message: insertErr?.message ?? 'Insert failed.',
      };
    }
    athleteId = inserted.id;
  }

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/app`;
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { athlete_id: athleteId, coach_id: args.coachId, name: args.name },
  });
  if (inviteErr) {
    return { ok: false, reason: 'invite_failed', message: inviteErr.message };
  }

  return { ok: true, athleteId, alreadyExisted };
}
