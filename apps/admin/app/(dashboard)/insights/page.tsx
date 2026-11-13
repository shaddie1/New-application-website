'use client';

import { useEffect } from 'react';
import Link from 'next/link';
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

  // One line for the moment the page is on screen, so it is never blank, and
  // a link for a visitor the redirect does not carry.
  return (
    <p role="status" className="text-sm text-charcoal-muted">
      Taking you to the Dashboard.{' '}
      <Link href="/#trend" className="font-medium text-navy underline underline-offset-4">
        Open the Dashboard
      </Link>
    </p>
  );
}
