'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { savePublicProfileSchema } from '../schemas';
import { slugify } from '../slugify';

const GENERIC_DB_ERROR = 'Failed to save profile. Please try again.';

function mask(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`saveOwnPublicProfile.${operation}: ${error.message}`));
  return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
}

export async function saveOwnPublicProfile(input: unknown) {
  const p = savePublicProfileSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  const athlete = await getCurrentAthlete();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('athlete_public_profiles')
    .select('id')
    .eq('athlete_id', athlete.id)
    .maybeSingle();

  const payload = {
    headline: p.data.headline,
    bio: p.data.bio,
    photo_url: p.data.photoUrl ?? null,
    recent_meet_results: p.data.recentMeetResults,
  };

  if (existing) {
    const { error } = await supabase
      .from('athlete_public_profiles')
      .update(payload)
      .eq('id', existing.id);
    if (error) return mask('update', error);
    return { ok: true as const, profileId: existing.id };
  }

  // First INSERT — derive slug, retry on collision with -2/-3/...
  const base = slugify(athlete.name) || 'athlete';
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const { data, error } = await supabase
      .from('athlete_public_profiles')
      .insert({ athlete_id: athlete.id, slug: candidate, ...payload })
      .select('id').single();
    if (!error && data) return { ok: true as const, profileId: data.id };
    if (error?.code === '23505') continue;
    return mask('insert', error ?? { message: 'no row' });
  }
  return mask('slug_exhausted', { message: 'too many slug collisions' });
}
