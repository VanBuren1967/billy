'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { SITE_URL } from '@/lib/supabase/env';

const Schema = z.object({ email: z.string().email() });

export type LoginState = { ok: boolean; error?: string };

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = Schema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { ok: false, error: 'Please enter a valid email.' };
  }

  const supabase = await createClient();
  // NOTE: SITE_URL/auth/callback must be added to Supabase Dashboard
  // → Auth → URL Configuration → Redirect URLs before production deploy.
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${SITE_URL}/auth/callback` },
  });

  if (error) {
    return { ok: false, error: 'Could not send link. Try again in a moment.' };
  }
  return { ok: true };
}
