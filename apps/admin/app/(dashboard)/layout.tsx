'use client';

import {
  Briefcase,
  CalendarDays,
  ChartPie,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FolderLock,
  Globe,
  Landmark,
  LayoutDashboard,
  Menu,
  Receipt,
  Tags,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth, useRequireAdmin } from '../../src/lib/auth';
import { cn } from '../../src/lib/cn';
import {
  JOB_REPORTS,
  OPERATIONS,
  OWNER_FINANCE,
  OWNER_GOVERNANCE,
  WEBSITE,
  isActivePath,
} from '../../src/lib/nav';

/** One small icon per menu item, by address. */
const ICONS: Record<string, LucideIcon> = {
  '/': LayoutDashboard,
  '/projects': Briefcase,
  '/calendar': CalendarDays,
  '/bookings': ClipboardList,
  '/quotes': FileText,
  '/job-reports': ClipboardCheck,
  '/financials': Receipt,
  '/finance': Landmark,
  '/rates': Tags,
  '/equity': ChartPie,
  '/documents': FolderLock,
  '/team': Users,
  '/website-jobs': Globe,
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = useRequireAdmin();
  const { signOut } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Escape closes the phone menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-charcoal-muted">Loading…</div>;
  }
  if (!session) return null; // redirecting to /login

  const { role, isOwner } = session.user;
  const canPublishWebsite = isOwner || role === 'ADMIN' || role === 'MARKETING';

  // Grouped so the menu reads as sections rather than one long list.
  const sections = [
    ...(isOwner
      ? [
          { title: 'Operations', items: OPERATIONS },
          { title: 'Finance', items: OWNER_FINANCE },
          { title: 'Governance', items: OWNER_GOVERNANCE },
        ]
      : [{ title: 'Operations', items: [...OPERATIONS, JOB_REPORTS] }]),
    ...(canPublishWebsite ? [{ title: 'Website', items: WEBSITE }] : []),
  ];

  const menuLinks = (
    <nav aria-label="Main menu" className="space-y-6">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-charcoal-muted">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = ICONS[item.href];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-navy font-medium text-white'
                        : 'text-charcoal-muted hover:bg-mist hover:text-charcoal',
                    )}
                  >
                    {Icon && (
                      <Icon aria-hidden="true" className={cn('size-4 shrink-0', active && 'text-gold')} strokeWidth={1.75} />
                    )}
                    <span className="min-w-0">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  // Who is signed in, and the way out. In the rail and in the phone menu.
  const account = (
    <>
      <p className="truncate text-sm text-charcoal">{session.user.fullName}</p>
      <button onClick={signOut} className="mt-1 rounded text-xs text-charcoal-muted underline-offset-2 hover:text-charcoal hover:underline">
        Sign out
      </button>
    </>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Phone bar: below 768 px the menu folds behind a button. */}
      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
        <span className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="OnyxHawk Cleaning Service" className="h-10 w-auto" />
          <span className="font-serif text-base">
            OnyxHawk <span className="text-aqua-deep">Admin</span>
          </span>
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          className="rounded-md p-2 text-charcoal transition-colors hover:bg-mist"
        >
          {open ? <X aria-hidden="true" className="size-[22px]" /> : <Menu aria-hidden="true" className="size-[22px]" />}
        </button>
      </div>

      {open && (
        <div className="border-b border-line bg-surface md:hidden">
          <div className="max-w-sm px-2 py-4">{menuLinks}</div>
          <div className="border-t border-line px-5 py-4">{account}</div>
        </div>
      )}

      {/* The rail, from 768 px. Narrower up to 1023 px, so the page keeps its room. */}
      <aside className="hidden w-48 shrink-0 border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-screen md:flex-col lg:w-60">
        <div className="px-4 py-5 lg:px-5">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="OnyxHawk Cleaning Service" className="h-11 w-auto" />
            <span className="font-serif text-base leading-tight">
              OnyxHawk <span className="text-aqua-deep">Admin</span>
            </span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">{menuLinks}</div>

        <div className="border-t border-line px-4 py-4 lg:px-5">{account}</div>
      </aside>

      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 md:px-5 lg:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
