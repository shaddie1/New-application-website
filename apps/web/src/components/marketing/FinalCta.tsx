import { Container } from '../layout';
import { ButtonLink } from '../ui';
import { MailIcon, PhoneIcon, WhatsAppIcon } from '../icons';
import { COMPANY, WHATSAPP_LINK } from '../../content/site';

export function FinalCta() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <div className="relative overflow-hidden rounded-xl border border-gold-bright/40 bg-gradient-to-br from-gold/[0.12] via-white to-white px-6 py-14 text-center sm:px-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[40rem] -translate-x-1/2 rounded-pill bg-gold-bright/15 blur-3xl"
          />

          <div className="relative">
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-charcoal sm:text-4xl">
              Ready for a spotless space?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-charcoal-muted sm:text-lg">
              Get your free quote today — booked in minutes, paid by M-Pesa, with photo proof on every visit.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink href="/quote" size="lg">
                Get a free quote
              </ButtonLink>
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-pill border border-gold-bright/45 px-6 py-3 text-base font-medium text-charcoal transition-colors hover:bg-gold-bright/15"
              >
                <WhatsAppIcon className="h-5 w-5" />
                Chat on WhatsApp
              </a>
            </div>

            <div className="mt-10 flex flex-col items-center justify-center gap-x-8 gap-y-3 text-sm text-charcoal-muted sm:flex-row">
              <a href={`tel:${COMPANY.phoneE164}`} className="inline-flex items-center gap-2 hover:text-bronze/80">
                <PhoneIcon className="h-4 w-4 text-bronze" />
                {COMPANY.phoneDisplay}
              </a>
              <a href={`mailto:${COMPANY.email}`} className="inline-flex items-center gap-2 hover:text-bronze/80">
                <MailIcon className="h-4 w-4 text-bronze" />
                {COMPANY.email}
              </a>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
