import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of OnyxHawk cleaning services.',
};

const UPDATED = 'June 2026';

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="font-serif text-4xl text-text">Terms of Service</h1>
      <p className="mt-2 text-sm text-text-muted">Last updated: {UPDATED}</p>

      <div className="mt-8 space-y-8 text-text-muted">
        <Section title="1. About these terms">
          <p>
            These terms govern your use of OnyxHawk’s website, app and cleaning services in Kenya. By booking or
            using our services, you agree to them.
          </p>
        </Section>

        <Section title="2. Your account">
          <p>
            You sign in with your phone number and a one-time code. You’re responsible for activity on your
            account and for keeping access to your phone number secure.
          </p>
        </Section>

        <Section title="3. Bookings & quotes">
          <p>
            For standard cleans you book a date, time and address in the app. Specialist services (e.g. sofa,
            carpet, mattress, curtains, AC &amp; duct, mould treatment, fumigation, office contracts) are provided
            on a custom quote. A booking is confirmed once payment is received.
          </p>
        </Section>

        <Section title="4. Pricing & payment">
          <p>
            Prices for standard cleans are shown before you confirm. Payment is made via M-Pesa. Quoted services
            are billed at the agreed amount. All prices are in Kenyan Shillings.
          </p>
        </Section>

        <Section title="5. Cancellations & rescheduling">
          <p>
            You can reschedule or cancel a booking from your account before the crew is dispatched. Refunds or
            credits for cancellations follow the policy communicated at the time of booking.
          </p>
        </Section>

        <Section title="6. Hawk Points">
          <p>
            Hawk Points are a loyalty reward with no cash value. Earning rates, tiers and perks may change, and
            points may expire or be adjusted in cases of cancellation, refund or misuse.
          </p>
        </Section>

        <Section title="7. Your responsibilities">
          <p>
            Please provide safe access to the premises, accurate information, and secure any valuables or fragile
            items. Let us know of hazards, pets or special instructions in advance.
          </p>
        </Section>

        <Section title="8. Photos">
          <p>
            Crews may capture before/after photos of the cleaned areas for quality and documentation, visible to
            you on your booking. Tell us in advance if you’d prefer they don’t.
          </p>
        </Section>

        <Section title="9. Liability">
          <p>
            We aim to deliver a high-quality service and will address valid concerns reported promptly. To the
            extent permitted by law, our liability is limited to the value of the affected booking. Nothing here
            excludes liability that cannot be excluded by law.
          </p>
        </Section>

        <Section title="10. Governing law">
          <p>These terms are governed by the laws of Kenya.</p>
        </Section>

        <Section title="11. Contact">
          <p>
            <a href="mailto:info@onyxhawkcleaningservice.com" className="text-gold-deep hover:underline">
              info@onyxhawkcleaningservice.com
            </a>{' '}
            · <a href="tel:+254115247988" className="text-gold-deep hover:underline">+254 115 247 988</a> · Nairobi, Kenya.
          </p>
        </Section>
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-serif text-2xl text-text">{title}</h2>
      {children}
    </section>
  );
}
