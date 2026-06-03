'use client';

import Link from 'next/link';

import { useAuth } from '../lib/auth';
import { Brand } from './Brand';
import { ButtonLink } from './ui';

const NAV = [
  { href: '/services', label: 'Services' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/quote', label: 'Get a quote' },
];

export function SiteHeader() {
  const { session } = useAuth();
  const signedIn = !!session && session.user.role !== 'ADMIN' && session.user.role !== 'SUPPORT';

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Brand />
        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-text-muted hover:text-text">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <ButtonLink href="/dashboard" size="sm">
              My dashboard
            </ButtonLink>
          ) : (
            <>
              <Link href="/sign-in" className="hidden text-sm text-text-muted hover:text-text sm:inline">
                Sign in
              </Link>
              <ButtonLink href="/sign-in" size="sm">
                Book a clean
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
