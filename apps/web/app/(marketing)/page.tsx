import { ButtonLink, Card } from '../../src/components/ui';
import { heroImage, serviceImage } from '../../src/lib/serviceImages';

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
  { name: 'Residential', tagline: 'Standard, deep & move-out cleans', img: serviceImage.residential },
  { name: 'Office', tagline: 'Workspaces kept spotless', img: serviceImage.office },
  { name: 'Sofa & upholstery', tagline: 'Fabric & leather, deep-cleaned', img: serviceImage.sofa },
  { name: 'Carpet & rugs', tagline: 'Steam & shampoo cleaning', img: serviceImage.carpet },
  { name: 'Mattress', tagline: 'Sanitised & refreshed', img: serviceImage.mattress },
  { name: 'Curtains & drapes', tagline: 'Cleaned and rehung', img: serviceImage.curtain },
  { name: 'AC & duct', tagline: 'Cleaner, more efficient air', img: serviceImage.ac_duct },
  { name: 'Mould & damp', tagline: 'Treated and prevented', img: serviceImage.mould },
  { name: 'Hospital', tagline: 'Clinical-grade sanitation', img: serviceImage.hospital },
  { name: 'Post-build', tagline: 'After renovations & fit-outs', img: serviceImage.post_build },
  { name: 'Fumigation', tagline: 'Pest control done right', img: serviceImage.fumigation },
];

const INDUSTRIES = [
  'Homes & apartments',
  'Offices',
  'Clinics & hospitals',
  'Schools',
  'Gyms & studios',
  'Retail & malls',
  'Banks',
  'Churches',
];

const FEATURES = [
  { icon: '📲', title: 'Pay with M-Pesa', body: 'Confirm with an STK push to your phone — no cash, no cards.' },
  { icon: '⭐', title: 'Earn Hawk Points', body: 'Collect points on every clean, double on weekends, and climb tiers for perks.' },
  { icon: '📸', title: 'Before & after photos', body: 'Your crew documents the work, attached right to your booking.' },
  { icon: '🏷️', title: 'See the price first', body: 'Get your full quote before you confirm — no surprises at the door.' },
  { icon: '📅', title: 'Real-time scheduling', body: 'Pick from genuinely open slots and we match a crew to your job.' },
  { icon: '📱', title: 'Everything in one place', body: 'Book, track status, pay and rebook — from the web or the app.' },
];

const FAQS = [
  {
    q: 'How do I book a clean?',
    a: 'Sign in with your phone number, choose a service and scope, pick a date and time, then confirm with M-Pesa — it takes a couple of minutes.',
  },
  {
    q: 'How do I pay?',
    a: 'We send an M-Pesa STK push to your phone. Enter your PIN to confirm and your booking is instantly secured — no cash needed.',
  },
  {
    q: 'What are Hawk Points?',
    a: 'Our loyalty rewards. You earn points on every clean (double on weekends) and move from Bronze to Platinum, unlocking perks along the way.',
  },
  {
    q: 'Do you show prices?',
    a: 'Yes — you see your full price before you confirm a booking. Specialist jobs like sofa, carpet, office contracts and fumigation are custom-quoted; just request a quote.',
  },
  {
    q: 'Will I see proof of the work?',
    a: 'Absolutely. Your crew captures before and after photos, attached to your booking so you can see the results.',
  },
  {
    q: 'Can I reschedule or cancel?',
    a: 'Yes — manage your booking any time before the crew is on the way, from your dashboard.',
  },
  {
    q: 'Which areas do you cover?',
    a: 'Nairobi and the surrounding areas. Not sure if we reach you? Request a quote and we’ll confirm.',
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-surface-dark">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroImage}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-20"
        />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2 md:items-center md:py-28">
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
              <div key={s.name} className="overflow-hidden rounded-xl border border-border bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.img}
                  alt={`${s.name} cleaning`}
                  loading="lazy"
                  className="h-40 w-full bg-bg-muted object-cover"
                />
                <div className="p-5">
                  <h3 className="font-medium text-text">{s.name}</h3>
                  <p className="text-sm text-text-muted">{s.tagline}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why OnyxHawk */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="font-serif text-3xl text-text">Why OnyxHawk</h2>
        <p className="mt-2 max-w-xl text-text-muted">
          Premium cleaning built for Nairobi — with rewards, proof of work, and M-Pesa convenience.
        </p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <span className="text-2xl" aria-hidden>
                {f.icon}
              </span>
              <h3 className="mt-3 text-lg font-medium text-text">{f.title}</h3>
              <p className="mt-1 text-sm text-text-muted">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Who we clean for */}
      <section className="bg-bg-muted">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="font-serif text-3xl text-text">Who we clean for</h2>
          <p className="mt-2 max-w-xl text-text-muted">
            From homes to high-traffic workplaces — with quality products and trained, vetted crews.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            {INDUSTRIES.map((i) => (
              <span key={i} className="rounded-pill border border-border bg-surface px-4 py-2 text-sm text-text">
                {i}
              </span>
            ))}
          </div>
          <div className="mt-10 rounded-xl border border-border bg-surface p-6 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-text-muted">Trusted by</p>
              <p className="mt-1 font-serif text-2xl text-text">Verst Carbon</p>
              <p className="text-sm text-text-muted">Keeping their Nairobi offices spotless.</p>
            </div>
            <ButtonLink href="/quote" variant="secondary" size="md" className="mt-4 sm:mt-0">
              Get a quote for your business
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-bg">
        <div className="mx-auto max-w-3xl px-5 py-20">
          <h2 className="font-serif text-3xl text-text">Frequently asked questions</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-xl border border-border bg-surface px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-text">
                  {f.q}
                  <span className="ml-4 text-xl text-gold-deep transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-text-muted">{f.a}</p>
              </details>
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
