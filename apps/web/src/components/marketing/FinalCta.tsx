import { Container } from '../layout';
import { ButtonLink } from '../ui';
import { MailIcon, PhoneIcon, WhatsAppIcon } from '../icons';
import { COMPANY, WHATSAPP_LINK } from '../../content/site';

export function FinalCta() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <div className="relative overflow-hidden rounded-xl bg-navy px-6 py-14 text-center sm:px-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[40rem] -translate-x-1/2 rounded-pill bg-aqua/35 blur-3xl"
          />

          <div className="relative">
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              Ready for a spotless space?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-text-on-dark-muted sm:text-lg">
              Get your free quote today — booked in minutes, paid by M-Pesa, with photo proof on every visit.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink href="/quote" size="lg" variant="accent">
                Get a free quote
              </ButtonLink>
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-pill border border-white/30 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-white/10"
              >
                <WhatsAppIcon className="h-5 w-5" />
                Chat on WhatsApp
              </a>
            </div>

            <div className="mt-10 flex flex-col items-center justify-center gap-x-8 gap-y-3 text-sm text-text-on-dark-muted sm:flex-row">
              <a href={`tel:${COMPANY.phoneE164}`} className="inline-flex items-center gap-2 hover:text-white">
                <PhoneIcon className="h-4 w-4 text-aqua-light" />
                {COMPANY.phoneDisplay}
              </a>
              <a href={`mailto:${COMPANY.email}`} className="inline-flex items-center gap-2 hover:text-white">
                <MailIcon className="h-4 w-4 text-aqua-light" />
                {COMPANY.email}
              </a>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
