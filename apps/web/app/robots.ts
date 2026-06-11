import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Signed-in app routes aren't useful to index (they're client-gated anyway).
      disallow: ['/dashboard', '/book', '/bookings', '/loyalty', '/profile', '/sign-in'],
    },
    sitemap: 'https://onyxhawkcleaningservice.com/sitemap.xml',
  };
}
