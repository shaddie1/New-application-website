'use client';

import { AppNav } from '../../src/components/AppNav';
import { useRequireAuth } from '../../src/lib/auth';
import { Spinner } from '../../src/components/ui';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = useRequireAuth();

  // Hydrating or redirecting — don't flash protected content.
  if (!session || session.user.role === 'ADMIN' || session.user.role === 'SUPPORT') {
    return (
      <div className="flex min-h-screen items-center justify-center text-text-muted">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}
