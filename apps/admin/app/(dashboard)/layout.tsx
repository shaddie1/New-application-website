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
    ? [
        ...NAV,
        { href: '/team', label: 'Team' },
        { href: '/insights', label: 'Insights' },
        { href: '/financials', label: 'Financials' },
        { href: '/finance', label: 'Finance' },
        { href: '/equity', label: 'Ownership' },
      ]
    : [...NAV, { href: '/job-reports', label: 'Job Reports' }];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <span className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="OnyxHawk Cleaning Service" className="h-10 w-auto" />
              <span className="text-lg" style={{ fontFamily: 'Georgia, serif' }}>
                OnyxHawk <span className="text-gold-deep">Admin</span>
              </span>
            </span>
            <nav className="flex items-center gap-1">
              {nav.map((item) => {
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-charcoal text-white' : 'text-charcoal-muted hover:bg-cream-deep'}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-charcoal-muted text-sm">{session.user.fullName}</span>
            <button onClick={signOut} className="rounded-lg border border-line px-3 py-1.5 text-sm text-danger">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
