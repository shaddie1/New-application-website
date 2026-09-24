import { Container } from '../layout';
import { ButtonLink } from '../ui';
import { CheckIcon } from '../icons';
import { HeroPhotos } from './HeroPhotos';
import { TRUST_STATS } from '../../content/site';

const HERO_PROOF = ['Vetted, insured crews', 'Pay by M-Pesa', 'Before & after photos'];

export function Hero() {
  return (
    <section>
      <HeroPhotos>
        <Container className="py-20 sm:py-24">
          <div className="max-w-2xl">
            <p className="mb-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-bronze sm:text-sm">
              <span aria-hidden="true" className="h-px w-8 bg-bronze" />
              Nairobi · Homes · Offices · Clinics
            </p>

            <h1 className="text-4xl font-bold uppercase leading-[1.05] tracking-tight text-charcoal sm:text-5xl lg:text-6xl">
              Professional cleaning,{' '}
              <span className="bg-gradient-to-r from-bronze via-gold-bright to-bronze bg-clip-text text-transparent">
                booked in minutes
              </span>
            </h1>

            <p className="mt-6 max-w-xl border-l-2 border-bronze pl-5 text-lg leading-relaxed text-charcoal">
              Premium cleaning for homes, offices, clinics and more — delivered by trained, vetted crews across
              Nairobi and beyond, since 2019.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/quote" size="lg" className="!rounded-md uppercase tracking-wide">
                Get a free quote
              </ButtonLink>
              <ButtonLink
                href="/book"
                size="lg"
                variant="secondary"
                className="!rounded-md !border-charcoal/70 !bg-white/60 uppercase tracking-wide !text-charcoal hover:!bg-white"
              >
                Book now
              </ButtonLink>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
              {HERO_PROOF.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm font-medium text-charcoal">
                  <CheckIcon className="h-4 w-4 text-bronze" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </HeroPhotos>

      <TrustBar />
    </section>
  );
}

export function TrustBar() {
  return (
    <div className="border-y border-line bg-white">
      <Container>
        <dl className="grid grid-cols-2 gap-y-8 py-10 sm:grid-cols-4">
          {TRUST_STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <dt className="sr-only">{stat.label}</dt>
              <dd>
                <span className="block text-3xl font-bold tracking-tight text-bronze sm:text-4xl">{stat.value}</span>
                <span className="mt-1 block text-sm text-charcoal-muted">{stat.label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </div>
  );
}
