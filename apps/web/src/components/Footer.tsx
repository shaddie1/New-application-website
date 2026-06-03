import Link from 'next/link';

import { Brand } from './Brand';

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
          </div>
        </div>
        <p className="mt-10 text-xs text-text-on-dark-muted">
          © {new Date().getFullYear()} OnyxHawk. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
