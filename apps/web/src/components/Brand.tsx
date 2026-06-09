import Link from 'next/link';

/**
 * OnyxHawk brand.
 * - Light surfaces (header, app nav): the logo image.
 * - Dark surfaces (footer): the gold wordmark, since the logo art sits on a
 *   light background and would show as a white box on near-black.
 */
export function Brand({ href = '/', onDark = false }: { href?: string; onDark?: boolean }) {
  if (onDark) {
    return (
      <Link href={href} className="inline-flex items-baseline gap-1">
        <span className="font-serif text-xl tracking-tight text-text-on-dark">Onyx</span>
        <span className="bg-gradient-to-r from-gold-deep via-gold to-[#EBD9A8] bg-clip-text font-serif text-xl tracking-tight text-transparent">
          Hawk
        </span>
      </Link>
    );
  }

  return (
    <Link href={href} className="inline-flex items-center" aria-label="OnyxHawk Cleaning Service">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.jpg" alt="OnyxHawk Cleaning Service" width={48} height={48} className="h-12 w-auto" />
    </Link>
  );
}
