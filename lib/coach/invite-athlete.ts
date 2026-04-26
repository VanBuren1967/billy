import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type InviteAthleteArgs = {
  coachId: string;
  name: string;
  email: string;
};

export type InviteAthleteResult =
  | { ok: true; athleteId: string; alreadyExisted: boolean; linkedExistingUser?: boolean }
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
export async function inviteAthlete(args: InviteAthleteArgs): Promise<InviteAthleteResult> {
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
    // Edge case: the email already has an auth.users row (former coach, prior
    // signup attempt, leftover dev account). inviteUserByEmail refuses. Since
    // the user can already sign in with /login on their own, just link our
    // athletes row to their existing auth_user_id and mark active. The next
    // time they sign in they'll land on /app as this coach's athlete.
    const alreadyRegistered =
      /already (been )?registered/i.test(inviteErr.message) ||
      // @ts-expect-error: AuthApiError carries `code` at runtime in newer versions.
      inviteErr.code === 'email_exists';
    if (!alreadyRegistered) {
      return { ok: false, reason: 'invite_failed', message: inviteErr.message };
    }

    const { data: usersList, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) {
      return { ok: false, reason: 'invite_failed', message: listErr.message };
    }
    const existingUser = usersList?.users.find((u) => u.email?.toLowerCase() === email);
    if (!existingUser) {
      return {
        ok: false,
        reason: 'invite_failed',
        message: 'Email reported as registered but no matching auth user found.',
      };
    }

    const { error: updateErr } = await admin
      .from('athletes')
      .update({
        auth_user_id: existingUser.id,
        status: 'active',
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', athleteId);
    if (updateErr) {
      return { ok: false, reason: 'invite_failed', message: updateErr.message };
    }

    return { ok: true, athleteId, alreadyExisted, linkedExistingUser: true };
  }

  return { ok: true, athleteId, alreadyExisted };
}
