import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/about', '/pricing', '/faq', '/team', '/team/'],
        disallow: ['/app', '/coach', '/api', '/auth', '/login', '/dev', '/request-to-join/thanks'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
