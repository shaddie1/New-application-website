'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '../lib/auth';
import { Brand } from './Brand';

const LINKS = [
  { href: '/dashboard', label: 'Home' },
  { href: '/book', label: 'Book' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/loyalty', label: 'Hawk Points' },
  { href: '/profile', label: 'Profile' },
];

export function AppNav() {
  const { session, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.replace('/');
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
        <Brand href="/dashboard" />
        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-pill px-3.5 py-1.5 text-sm ${
                  active ? 'bg-surface-dark text-text-on-dark' : 'text-text-muted hover:bg-bg-muted hover:text-text'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          {session ? (
            <span className="hidden text-sm text-text-muted sm:inline">{session.user.fullName}</span>
          ) : null}
          <button onClick={handleSignOut} className="text-sm text-text-muted hover:text-danger">
            Sign out
          </button>
        </div>
      </div>
      {/* Mobile nav */}
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-border px-3 py-2 md:hidden">
        {LINKS.map((l) => {
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-pill px-3 py-1.5 text-sm ${
                active ? 'bg-surface-dark text-text-on-dark' : 'text-text-muted'
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
