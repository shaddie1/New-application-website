'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from '../../src/lib/auth';
import { landingPath } from '../../src/lib/landing';

/**
 * There is no Dashboard. The home address, still where the logo and old
 * bookmarks point, sends each account to its own first page: the owner to
 * Insights, everyone else to Projects. The layout sends anyone signed out to
 * the sign-in page.
 */
export default function HomePage() {
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session) router.replace(landingPath(session.user));
  }, [session, router]);

  return <div className="text-charcoal-muted">Loading…</div>;
}
