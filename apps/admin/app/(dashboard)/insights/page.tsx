'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Insights is part of the Dashboard now: its trend is the Dashboard's trend
 * section. The address stays, for the links and bookmarks that still point
 * here, and sends its visitor on. The admin is a static export with no server
 * to redirect for it, so the page does it in the browser.
 *
 * The Dashboard takes it from there: it brings the trend section into view
 * once it is ready, or takes `#trend` off the address for an account that has
 * no trend section (see `src/lib/hash-scroll.ts`).
 */
export default function InsightsRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Replaced, not pushed, so Back does not return here and bounce forward again.
    router.replace('/#trend');
  }, [router]);

  return null;
}
