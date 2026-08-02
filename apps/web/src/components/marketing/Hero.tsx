import { Container } from '../layout';
import { ButtonLink } from '../ui';
import { CheckIcon } from '../icons';
import { TRUST_STATS } from '../../content/site';

const HERO_PROOF = ['Vetted, insured crews', 'Pay by M-Pesa', 'Before & after photos'];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Warm gold bloom behind the headline, so the charcoal is not flat. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[72rem] -translate-x-1/2 rounded-pill bg-gold/[0.10] blur-3xl"
      />

      <Container className="relative py-20 sm:py-24 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-pill border border-gold/25 bg-gold/[0.08] px-4 py-1.5 text-xs font-medium tracking-wide text-gold">
              Nairobi & countrywide · Since 2019
            </p>

            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-text-on-dark sm:text-5xl lg:text-6xl">
              Professional cleaning,{' '}
              <span className="bg-gradient-to-r from-gold-soft via-gold to-gold-deep bg-clip-text text-transparent">
                booked in minutes
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-on-dark-muted">
              Premium cleaning for homes, offices, clinics and more — delivered by trained, vetted crews across
              Nairobi and beyond.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/quote" size="lg">
                Get a free quote
              </ButtonLink>
              <ButtonLink
                href="/book"
                size="lg"
                variant="secondary"
                className="border-gold/30 bg-transparent text-text-on-dark hover:bg-gold/10"
              >
                Book now
              </ButtonLink>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
              {HERO_PROOF.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-text-on-dark-muted">
                  <CheckIcon className="h-4 w-4 text-gold" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Image slot — swap the placeholder for a crew photo when one exists. */}
          <div className="relative">
            <div className="aspect-[4/5] w-full overflow-hidden rounded-xl border border-ink-border bg-gradient-to-br from-ink-raised via-ink-soft to-ink-raised">
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gold/70">
                  OnyxHawk crew
                </span>
                <p className="max-w-[16rem] text-sm text-text-on-dark-muted">
                  Photo of a uniformed crew on site goes here.
                </p>
              </div>
            </div>

            {/* Rating chip overlapping the image corner. */}
            <div className="absolute -bottom-5 -left-4 rounded-xl border border-ink-border bg-ink-raised px-5 py-4 shadow-lg sm:-left-6">
              <p className="text-2xl font-bold text-gold">4.9★</p>
              <p className="text-xs text-text-on-dark-muted">from 500+ clients</p>
            </div>
          </div>
        </div>
      </Container>

      <TrustBar />
    </section>
  );
}

export function TrustBar() {
  return (
    <div className="border-y border-ink-border bg-ink-raised">
      <Container>
        <dl className="grid grid-cols-2 gap-y-8 py-10 sm:grid-cols-4">
          {TRUST_STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <dt className="sr-only">{stat.label}</dt>
              <dd>
                <span className="block text-3xl font-bold tracking-tight text-gold sm:text-4xl">{stat.value}</span>
                <span className="mt-1 block text-sm text-text-on-dark-muted">{stat.label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </div>
  );
}
