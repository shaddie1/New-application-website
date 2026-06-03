import { ButtonLink, Card } from '../../../src/components/ui';

const STEPS = [
  {
    title: 'Choose your service & scope',
    body: 'Browse residential, office, hospital, post-build and fumigation cleans. Set bedrooms, bathrooms and add-ons — the price updates as you go.',
  },
  {
    title: 'Schedule a convenient slot',
    body: 'Pick a date, time and one of your saved addresses. Availability is live, so you only ever see open slots.',
  },
  {
    title: 'Confirm & pay with M-Pesa',
    body: 'We send an STK push to your phone. Enter your PIN and your booking is confirmed instantly — no cash, no cards needed.',
  },
  {
    title: 'Your crew arrives & cleans',
    body: 'A vetted crew is matched to your job. Track status from en-route to completed, and view before/after photos when they’re done.',
  },
  {
    title: 'Earn Hawk Points',
    body: 'Every clean earns 10 points per KSh 100 — double on weekends. Climb from Bronze to Platinum and unlock perks.',
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="font-serif text-4xl text-text">How OnyxHawk works</h1>
      <p className="mt-3 text-text-muted">From booking to sparkling clean in five simple steps.</p>

      <ol className="mt-10 space-y-4">
        {STEPS.map((s, i) => (
          <Card key={s.title} className="flex gap-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-surface-dark font-serif text-text-on-dark">
              {i + 1}
            </span>
            <div>
              <h2 className="text-lg font-medium text-text">{s.title}</h2>
              <p className="mt-1 text-sm text-text-muted">{s.body}</p>
            </div>
          </Card>
        ))}
      </ol>

      <div className="mt-10 flex gap-3">
        <ButtonLink href="/sign-in" size="lg">
          Book a clean
        </ButtonLink>
        <ButtonLink href="/services" variant="secondary" size="lg">
          See services
        </ButtonLink>
      </div>
    </div>
  );
}
