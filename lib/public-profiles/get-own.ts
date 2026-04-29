import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { slugify } from './slugify';

export type OwnPublicProfile = {
  id: string;
  slug: string;
  headline: string;
  bio: string;
  photoUrl: string | null;
  recentMeetResults: { meet: string; date: string; total_lbs: number; placement?: string | null }[];
  isPublished: boolean;
  publishedAt: string | null;
  updatedAt: string;
};

export async function getOwnPublicProfile(): Promise<{ profile: OwnPublicProfile | null; suggestedSlug: string }> {
  const athlete = await getCurrentAthlete();
  const supabase = await createClient();
  const { data } = await supabase
    .from('athlete_public_profiles')
    .select('id, slug, headline, bio, photo_url, recent_meet_results, is_published, published_at, updated_at')
    .eq('athlete_id', athlete.id)
    .maybeSingle();
  const suggestedSlug = slugify(athlete.name);
  if (!data) return { profile: null, suggestedSlug };
  return {
    profile: {
      id: data.id,
      slug: data.slug,
      headline: data.headline,
      bio: data.bio,
      photoUrl: data.photo_url,
      recentMeetResults: (data.recent_meet_results ?? []) as OwnPublicProfile['recentMeetResults'],
      isPublished: data.is_published,
      publishedAt: data.published_at,
      updatedAt: data.updated_at,
    },
    suggestedSlug,
  };
}
