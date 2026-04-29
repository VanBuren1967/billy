import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type TeamMember = {
  id: string;
  athleteId: string;
  athleteName: string;
  slug: string;
  headline: string;
  photoUrl: string | null;
};

export async function listPublicTeam(): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('athlete_public_profiles')
    .select('id, athlete_id, slug, headline, photo_url, athletes(name)')
    .eq('is_published', true)
    .order('published_at', { ascending: false });

  return (data ?? []).map((r) => {
    const a = r.athletes as unknown as { name: string } | null;
    return {
      id: r.id,
      athleteId: r.athlete_id,
      athleteName: a?.name ?? '—',
      slug: r.slug,
      headline: r.headline,
      photoUrl: r.photo_url,
    };
  });
}
