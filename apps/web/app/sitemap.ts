import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const BASE = 'https://onyxhawkcleaningservice.com';

export default function sitemap(): MetadataRoute.Sitemap {
  // Ordered by importance: the pages that win search traffic come first.
  const routes = ['', '/services', '/how-it-works', '/about', '/contact', '/quote', '/privacy', '/terms'];
  const priorities: Record<string, number> = {
    '': 1,
    '/services': 0.9,
    '/contact': 0.8,
    '/about': 0.8,
    '/how-it-works': 0.8,
    '/quote': 0.8,
  };
  return routes.map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: 'monthly',
    priority: priorities[path] ?? 0.5,
  }));
}
