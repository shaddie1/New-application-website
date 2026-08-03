'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '../lib/auth';
import { cn } from '../lib/cn';
import { Brand } from './Brand';
import { ButtonLink } from './ui';

const NAV = [
  { href: '/services', label: 'Services' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

export function SiteHeader() {
  const { session } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const signedIn = !!session && session.user.role !== 'ADMIN' && session.user.role !== 'SUPPORT';

  // Close the mobile menu on navigation, otherwise it stays open over the new page.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-6">
        <Brand />

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'text-sm transition-colors',
                  active ? 'font-medium text-bronze' : 'text-charcoal-muted hover:text-charcoal',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {signedIn ? (
            <ButtonLink href="/dashboard" size="sm">
              My dashboard
            </ButtonLink>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="hidden text-sm text-charcoal-muted transition-colors hover:text-charcoal sm:inline"
              >
                Sign in
              </Link>
              <ButtonLink href="/quote" size="sm" className="hidden sm:inline-flex">
                Get a quote
              </ButtonLink>
            </>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-charcoal md:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-line bg-cream px-5 py-4 md:hidden">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'block rounded-md px-3 py-2.5 text-[15px]',
                    pathname === item.href
                      ? 'bg-gold-bright/15 font-medium text-bronze'
                      : 'text-charcoal-muted hover:bg-cream-deep hover:text-charcoal',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          {!signedIn ? (
            <Link
              href="/sign-in"
              className="mt-3 block rounded-md px-3 py-2.5 text-[15px] text-charcoal-muted hover:bg-cream-deep hover:text-charcoal"
            >
              Sign in
            </Link>
          ) : null}
        </nav>
      ) : null}
    </header>
  );
}
