'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth, useRequireAdmin } from '../../src/lib/auth';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/quotes', label: 'Quotes' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = useRequireAdmin();
  const { signOut } = useAuth();
  const pathname = usePathname();

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-text-muted">Loading…</div>;
  }
  if (!session) return null; // redirecting to /login

  const nav = session.user.isOwner
    ? [...NAV, { href: '/team', label: 'Team' }, { href: '/financials', label: 'Financials' }]
    : [...NAV, { href: '/job-reports', label: 'Job Reports' }];

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <span className="text-lg" style={{ fontFamily: 'Georgia, serif' }}>
              OnyxHawk <span className="text-gold-deep">Admin</span>
            </span>
            <nav className="flex items-center gap-1">
              {nav.map((item) => {
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-surface-dark text-text-on-dark' : 'text-text-muted hover:bg-bg-muted'}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-text-muted text-sm">{session.user.fullName}</span>
            <button onClick={signOut} className="rounded-lg border border-border px-3 py-1.5 text-sm text-danger">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
