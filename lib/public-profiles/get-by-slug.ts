import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type PublicProfile = {
  id: string;
  athleteName: string;
  slug: string;
  headline: string;
  bio: string;
  photoUrl: string | null;
  recentMeetResults: { meet: string; date: string; total_lbs: number; placement?: string | null }[];
};

export async function getPublicProfileBySlug(slug: string): Promise<PublicProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('athlete_public_profiles')
    .select('id, slug, headline, bio, photo_url, recent_meet_results, athletes(name)')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (!data) return null;
  const a = data.athletes as unknown as { name: string } | null;
  return {
    id: data.id,
    athleteName: a?.name ?? '—',
    slug: data.slug,
    headline: data.headline,
    bio: data.bio,
    photoUrl: data.photo_url,
    recentMeetResults: (data.recent_meet_results ?? []) as PublicProfile['recentMeetResults'],
  };
}
