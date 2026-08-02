import Link from 'next/link';

import { WhatsAppIcon } from '../icons';
import { WHATSAPP_LINK } from '../../content/site';

/**
 * Persistent booking prompts.
 *
 * Mobile gets a bottom bar (most Kenyan visitors book on a phone, and a bar is
 * easier to hit than a bubble); desktop gets a single floating WhatsApp button.
 * The two never show at the same size, so they cannot overlap.
 */
export function FloatingActions() {
  return (
    <>
      {/* Mobile: sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-border bg-ink/95 px-4 py-3 backdrop-blur sm:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/quote"
            className="flex-1 rounded-pill bg-gradient-to-br from-gold to-gold-deep px-5 py-3 text-center text-[15px] font-semibold text-surface-dark"
          >
            Get a free quote
          </Link>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat with OnyxHawk on WhatsApp"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill border border-gold/30 text-gold"
          >
            <WhatsAppIcon className="h-6 w-6" />
          </a>
        </div>
      </div>

      {/* Desktop: floating WhatsApp button */}
      <a
        href={WHATSAPP_LINK}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with OnyxHawk on WhatsApp"
        className="fixed bottom-6 right-6 z-40 hidden h-14 w-14 items-center justify-center rounded-pill bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 sm:flex"
      >
        <WhatsAppIcon className="h-7 w-7" />
      </a>
    </>
  );
}
