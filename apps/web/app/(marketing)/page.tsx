import { ButtonLink, Card } from '../../src/components/ui';

const STEPS = [
  { n: '1', title: 'Pick your clean', body: 'Choose a service, set your home’s scope and any add-ons in a few taps.' },
  { n: '2', title: 'Schedule a slot', body: 'Pick a date, time and address. We’ll match a vetted crew to your booking.' },
  { n: '3', title: 'Pay with M-Pesa', body: 'Confirm with an STK push to your phone. Earn Hawk Points on every clean.' },
];

const WHY = [
  'Vetted, background-checked crews',
  'Pay securely with M-Pesa',
  'Earn Hawk Points on every clean',
  'Before & after photos of your space',
];

const SERVICES = [
  { name: 'Residential', tagline: 'Standard, deep & move-out cleans', color: 'bg-service-residential' },
  { name: 'Office', tagline: 'Workspaces kept spotless', color: 'bg-service-office' },
  { name: 'Hospital', tagline: 'Clinical-grade sanitation', color: 'bg-service-hospital' },
  { name: 'Post-build', tagline: 'After renovations & fit-outs', color: 'bg-service-post-build' },
  { name: 'Fumigation', tagline: 'Pest control done right', color: 'bg-service-fumigation' },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-surface-dark">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2 md:items-center md:py-28">
          <div>
            <span className="inline-block rounded-pill bg-gold-soft/20 px-3 py-1 text-xs font-medium text-gold">
              Nairobi · M-Pesa · Hawk Points
            </span>
            <h1 className="mt-5 font-serif text-4xl leading-tight text-text-on-dark md:text-5xl">
              A spotless home is one tap away.
            </h1>
            <p className="mt-5 max-w-md text-text-on-dark-muted">
              Book vetted cleaning crews for deep cleans, move-outs, offices and more. Secure M-Pesa
              payments and Hawk Points on every clean.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/sign-in" size="lg">
                Book a clean
              </ButtonLink>
              <ButtonLink href="/services" variant="secondary" size="lg" className="!bg-transparent !text-text-on-dark">
                Explore services
              </ButtonLink>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <div className="rounded-lg bg-bg p-5">
              <p className="font-serif text-xl text-text">Why OnyxHawk</p>
              <ul className="mt-4 space-y-3 text-sm text-text">
                {WHY.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-gold-soft text-xs text-gold-deep">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="font-serif text-3xl text-text">How it works</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <Card key={s.n}>
              <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-gold-soft font-serif text-gold-deep">
                {s.n}
              </span>
              <h3 className="mt-4 text-lg font-medium text-text">{s.title}</h3>
              <p className="mt-2 text-sm text-text-muted">{s.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Services */}
      <section className="bg-bg-muted">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="flex items-end justify-between">
            <h2 className="font-serif text-3xl text-text">Our services</h2>
            <ButtonLink href="/services" variant="ghost" size="sm">
              View all →
            </ButtonLink>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <Card key={s.name} className="flex items-center gap-4">
                <span className={`h-12 w-12 shrink-0 rounded-lg ${s.color}`} aria-hidden />
                <div>
                  <h3 className="font-medium text-text">{s.name}</h3>
                  <p className="text-sm text-text-muted">{s.tagline}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="rounded-xl bg-surface-dark px-8 py-14 text-center">
          <h2 className="font-serif text-3xl text-text-on-dark">Ready for a spotless space?</h2>
          <p className="mx-auto mt-3 max-w-md text-text-on-dark-muted">
            Sign in with your phone number and book your first clean in minutes.
          </p>
          <div className="mt-8 flex justify-center">
            <ButtonLink href="/sign-in" size="lg">
              Get started
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
