import type { MetadataRoute } from 'next';
import { listPublicTeam } from '@/lib/public-profiles/list-team';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/pricing`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/faq`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/team`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/request-to-join`, changeFrequency: 'monthly', priority: 0.7 },
  ];

  const profiles = await listPublicTeam();
  const profileRoutes: MetadataRoute.Sitemap = profiles.map((p) => ({
    url: `${SITE_URL}/team/${p.slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticRoutes, ...profileRoutes];
}
