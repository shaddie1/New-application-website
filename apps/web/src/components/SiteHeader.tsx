'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '../lib/auth';
import { cn } from '../lib/cn';
import { Brand } from './Brand';
import { ButtonLink } from './ui';
import { PhoneIcon, WhatsAppIcon } from './icons';
import { ALL_SERVICES, COMPANY, SEGMENTS, WHATSAPP_LINK } from '../content/site';

type NavChild = { href: string; label: string };
type NavItem = { href: string; label: string; children?: NavChild[] };

const NAV: NavItem[] = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  {
    href: '/services',
    label: 'Services',
    children: ALL_SERVICES.map((s) => ({ href: `/quote?service=${s.code}`, label: s.name })),
  },
  { href: '/portfolio', label: 'Portfolio' },
  {
    href: '/#coverage',
    label: 'Industries',
    children: SEGMENTS.map((s) => ({ href: `/#${s.slug}`, label: s.title })),
  },
  { href: '/contact', label: 'Contact' },
];

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden className={className}>
      <path d="M2.5 4.5 6 8l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

            if (!item.children) {
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
            }

            return (
              <div key={item.href} className="group relative">
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1 text-sm transition-colors',
                    active ? 'font-medium text-bronze' : 'text-charcoal-muted hover:text-charcoal',
                  )}
                >
                  {item.label}
                  <ChevronDownIcon className="h-3 w-3 transition-transform group-hover:rotate-180" />
                </Link>

                <div className="invisible absolute left-1/2 top-full z-20 w-64 -translate-x-1/2 pt-3 opacity-0 transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  <div className="rounded-xl border border-line bg-white p-2 shadow-lg">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="block rounded-md px-3 py-2 text-sm text-charcoal-muted transition-colors hover:bg-cream-deep hover:text-charcoal"
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {/* Always-visible WhatsApp entry point — the fastest way most
              Kenyan customers want to reach a business. */}
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat with OnyxHawk on WhatsApp"
            title="Chat on WhatsApp"
            className="flex h-9 w-9 items-center justify-center rounded-pill bg-[#25D366] text-white transition-transform hover:scale-105"
          >
            <WhatsAppIcon className="h-5 w-5" />
          </a>

          <a
            href={`tel:${COMPANY.phoneE164}`}
            className="hidden items-center gap-2 rounded-pill bg-gradient-to-br from-gold to-gold-deep px-4 py-2 text-sm font-semibold text-surface-dark shadow-sm transition-transform hover:scale-[1.03] lg:inline-flex"
          >
            <PhoneIcon className="h-4 w-4" />
            {COMPANY.phoneDisplay}
          </a>

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
            {NAV.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'block rounded-md px-3 py-2.5 text-[15px]',
                      active
                        ? 'bg-gold-bright/15 font-medium text-bronze'
                        : 'text-charcoal-muted hover:bg-cream-deep hover:text-charcoal',
                    )}
                  >
                    {item.label}
                  </Link>
                  {item.children ? (
                    <ul className="ml-3 space-y-0.5 border-l border-line pl-3">
                      {item.children.map((child) => (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className="block rounded-md px-3 py-2 text-sm text-charcoal-muted hover:bg-cream-deep hover:text-charcoal"
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <a
            href={`tel:${COMPANY.phoneE164}`}
            className="mt-3 flex items-center justify-center gap-2 rounded-pill bg-gradient-to-br from-gold to-gold-deep px-4 py-2.5 text-sm font-semibold text-surface-dark"
          >
            <PhoneIcon className="h-4 w-4" />
            {COMPANY.phoneDisplay}
          </a>

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
