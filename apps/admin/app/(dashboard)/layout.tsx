'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth, useRequireAdmin } from '../../src/lib/auth';

/** Grouped so the rail reads as sections rather than one long list. */
const OPERATIONS = [
  { href: '/', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/quotes', label: 'Quotes' },
];

const OWNER_FINANCE = [
  { href: '/insights', label: 'Insights' },
  { href: '/financials', label: 'Financials' },
  { href: '/finance', label: 'Finance' },
];

const OWNER_GOVERNANCE = [
  { href: '/equity', label: 'Ownership' },
  // Shareholder-only; the API refuses non-shareholders regardless.
  { href: '/documents', label: 'Documents' },
  { href: '/team', label: 'Team' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = useRequireAdmin();
  const { signOut } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-charcoal-muted">Loading…</div>;
  }
  if (!session) return null; // redirecting to /login

  const sections = session.user.isOwner
    ? [
        { title: 'Operations', items: OPERATIONS },
        { title: 'Finance', items: OWNER_FINANCE },
        { title: 'Governance', items: OWNER_GOVERNANCE },
      ]
    : [{ title: 'Operations', items: [...OPERATIONS, { href: '/job-reports', label: 'Job Reports' }] }];

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  const railLinks = (
    <nav className="space-y-6">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-charcoal-muted">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive(item.href)
                      ? 'bg-charcoal font-medium text-white'
                      : 'text-charcoal-muted hover:bg-cream-deep hover:text-charcoal'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Mobile bar: the rail collapses rather than disappearing. */}
      <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
        <span className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="OnyxHawk Cleaning Service" className="h-8 w-auto" />
          <span className="text-base" style={{ fontFamily: 'Georgia, serif' }}>
            OnyxHawk <span className="text-gold-deep">Admin</span>
          </span>
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          className="rounded-md p-2 text-charcoal"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {open && <div className="border-b border-line bg-white px-4 py-4 lg:hidden">{railLinks}</div>}

      {/* Desktop rail */}
      <aside className="hidden w-60 shrink-0 border-r border-line bg-white lg:flex lg:flex-col">
        <div className="px-5 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="OnyxHawk Cleaning Service" className="h-9 w-auto" />
            <span className="text-base leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
              OnyxHawk <span className="text-gold-deep">Admin</span>
            </span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">{railLinks}</div>

        <div className="border-t border-line px-5 py-4">
          <p className="truncate text-sm text-charcoal">{session.user.fullName}</p>
          <button onClick={signOut} className="mt-1 text-xs text-danger hover:underline">
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
