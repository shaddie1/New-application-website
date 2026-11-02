'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { MySharesAccess } from '@onyxhawk/types';
import { api } from '../../src/lib/api';
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
  { href: '/rates', label: 'Quote rates' },
];

const OWNER_GOVERNANCE = [
  { href: '/equity', label: 'Ownership' },
  // Shareholder-only; the API refuses non-shareholders regardless.
  { href: '/documents', label: 'Documents' },
  { href: '/team', label: 'Team' },
];

// Owner, admins and marketing; the API refuses everyone else regardless.
const WEBSITE = [{ href: '/website-jobs', label: 'Website jobs' }];

/** The owner opens every holder's page; anyone linked to the shareholder list opens their own. */
const SHAREHOLDER_PAGES = { href: '/my-shares', label: 'Shareholder pages' };
const MY_SHARES = { href: '/my-shares', label: 'My shares' };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = useRequireAdmin();
  const { signOut } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The API, not the session, says whether a shareholder page exists for this
  // account (KTD9). Until it answers, or if it fails, the menu is as it was.
  const [shareAccess, setShareAccess] = useState<MySharesAccess | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    setShareAccess(null);
    if (!userId) return;
    let current = true;
    api
      .mySharesAccess()
      .then((access) => {
        if (current) setShareAccess(access);
      })
      .catch(() => {
        /* no shareholder link in the menu */
      });
    return () => {
      current = false;
    };
  }, [userId]);

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-charcoal-muted">Loading…</div>;
  }
  if (!session) return null; // redirecting to /login

  const { role, isOwner } = session.user;
  const canPublishWebsite = isOwner || role === 'ADMIN' || role === 'MARKETING';

  const canViewAllShares = shareAccess?.canViewAll === true;
  const hasOwnShares = !canViewAllShares && !!shareAccess?.shareholderId;
  // "Shareholder pages" sits beside Ownership, where the holders are kept.
  const governance = canViewAllShares
    ? [OWNER_GOVERNANCE[0]!, SHAREHOLDER_PAGES, ...OWNER_GOVERNANCE.slice(1)]
    : OWNER_GOVERNANCE;

  const sections = [
    // A linked shareholder who is not the owner finds their page first.
    ...(hasOwnShares ? [{ title: 'Shareholder', items: [MY_SHARES] }] : []),
    ...(isOwner
      ? [
          { title: 'Operations', items: OPERATIONS },
          { title: 'Finance', items: OWNER_FINANCE },
          { title: 'Governance', items: governance },
        ]
      : [{ title: 'Operations', items: [...OPERATIONS, { href: '/job-reports', label: 'Job Reports' }] }]),
    ...(canPublishWebsite ? [{ title: 'Website', items: WEBSITE }] : []),
  ];

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
                      : 'text-charcoal-muted hover:bg-mist hover:text-charcoal'
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
      {/* Mobile bar: the rail collapses rather than disappearing. The menu
          never prints: a printed page is a report, not the app. */}
      <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden print:hidden">
        <span className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="OnyxHawk Cleaning Service" className="h-8 w-auto" />
          <span className="text-base" style={{ fontFamily: 'Georgia, serif' }}>
            OnyxHawk <span className="text-aqua-deep">Admin</span>
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

      {open && <div className="border-b border-line bg-white px-4 py-4 lg:hidden print:hidden">{railLinks}</div>}

      {/* Desktop rail */}
      <aside className="hidden w-60 shrink-0 border-r border-line bg-white lg:flex lg:flex-col print:hidden">
        <div className="px-5 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="OnyxHawk Cleaning Service" className="h-9 w-auto" />
            <span className="text-base leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
              OnyxHawk <span className="text-aqua-deep">Admin</span>
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

      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 print:p-0">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
