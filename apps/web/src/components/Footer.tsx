import Link from 'next/link';
import type { ReactNode } from 'react';

import { Brand } from './Brand';

// Real, branded social icons. Add Instagram/Facebook/TikTok/X here once handles
// are known (each just needs an href + its icon below).
const SOCIALS: { name: string; href: string; icon: ReactNode }[] = [
  {
    name: 'WhatsApp',
    href: 'https://wa.me/254115247988',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4.5 w-4.5" width="18" height="18">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
      </svg>
    ),
  },
];

export function Footer() {
  return (
    <footer className="mt-24 bg-surface-dark text-text-on-dark-muted">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <Brand onDark />
            <p className="mt-3 text-sm">
              Premium cleaning crews across Nairobi. Pay with M-Pesa, earn Hawk Points on every clean.
            </p>
            <div className="mt-5 flex gap-3">
              {SOCIALS.map((s) => (
                <a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  className="flex h-9 w-9 items-center justify-center rounded-pill border border-white/15 text-text-on-dark-muted transition-colors hover:border-gold hover:text-gold"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>
          <div className="flex gap-12">
            <div className="flex flex-col gap-2 text-sm">
              <span className="text-text-on-dark">Company</span>
              <Link href="/services" className="hover:text-text-on-dark">
                Services
              </Link>
              <Link href="/how-it-works" className="hover:text-text-on-dark">
                How it works
              </Link>
              <Link href="/quote" className="hover:text-text-on-dark">
                Get a quote
              </Link>
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <span className="text-text-on-dark">Account</span>
              <Link href="/sign-in" className="hover:text-text-on-dark">
                Sign in
              </Link>
              <Link href="/dashboard" className="hover:text-text-on-dark">
                My bookings
              </Link>
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <span className="text-text-on-dark">Contact</span>
              <a href="tel:+254115247988" className="hover:text-text-on-dark">
                +254 115 247 988
              </a>
              <a href="mailto:info@onyxhawkcleaningservice.com" className="hover:text-text-on-dark">
                info@onyxhawkcleaningservice.com
              </a>
              <span>Nairobi, Kenya</span>
            </div>
          </div>
        </div>
        <p className="mt-10 text-xs text-text-on-dark-muted">
          © {new Date().getFullYear()} OnyxHawk. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
