import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const BASE = 'https://onyxhawkcleaningservice.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/services', '/how-it-works', '/quote', '/privacy', '/terms'];
  return routes.map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: 'monthly',
    priority: path === '' ? 1 : 0.7,
  }));
}
