import Link from 'next/link';

/** OnyxHawk wordmark. */
export function Brand({ href = '/', onDark = false }: { href?: string; onDark?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-baseline gap-1">
      <span className={`font-serif text-xl tracking-tight ${onDark ? 'text-text-on-dark' : 'text-text'}`}>
        Onyx
      </span>
      <span className="bg-gradient-to-r from-gold-deep via-gold to-[#EBD9A8] bg-clip-text font-serif text-xl tracking-tight text-transparent">
        Hawk
      </span>
    </Link>
  );
}
