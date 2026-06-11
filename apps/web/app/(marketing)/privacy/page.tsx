import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How OnyxHawk collects, uses and protects your personal information.',
};

const UPDATED = 'June 2026';

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="font-serif text-4xl text-text">Privacy Policy</h1>
      <p className="mt-2 text-sm text-text-muted">Last updated: {UPDATED}</p>

      <div className="mt-8 space-y-8 text-text-muted">
        <section>
          <p>
            This policy explains how OnyxHawk (“we”, “us”) collects, uses and protects your personal information
            when you use our website, mobile app and cleaning services in Kenya. We handle personal data in line
            with the Kenya Data Protection Act, 2019.
          </p>
        </section>

        <Section title="Information we collect">
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Account details:</b> your phone number (used to sign you in), name, and email if you provide one.</li>
            <li><b>Service details:</b> the addresses you save, booking scope, dates, and notes for the crew.</li>
            <li><b>Payment information:</b> the M-Pesa number used to pay. Payments are processed by Safaricom (M-Pesa) — we do not see or store your M-Pesa PIN.</li>
            <li><b>Photos:</b> before/after photos of the areas cleaned, captured by the crew for your booking.</li>
            <li><b>Usage data:</b> basic device and log information needed to run and secure the service.</li>
          </ul>
        </Section>

        <Section title="How we use your information">
          <ul className="list-disc space-y-1 pl-5">
            <li>To provide and schedule cleaning services and match you with a crew.</li>
            <li>To verify your phone number and keep your account secure (one-time codes by SMS).</li>
            <li>To process payments via M-Pesa and issue receipts.</li>
            <li>To run the Hawk Points loyalty programme.</li>
            <li>To send booking updates and respond to support requests.</li>
          </ul>
        </Section>

        <Section title="When we share information">
          <p>We don’t sell your data. We share only what’s necessary with:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><b>Cleaning crews</b> assigned to your booking, to carry out the work.</li>
            <li><b>Safaricom (M-Pesa / Daraja)</b> to process payments.</li>
            <li><b>Africa’s Talking</b> to deliver SMS one-time codes and notifications.</li>
            <li><b>Infrastructure providers</b> that host the service on our behalf.</li>
            <li>Authorities where required by law.</li>
          </ul>
        </Section>

        <Section title="Storage & security">
          <p>
            Data is transmitted over encrypted connections (HTTPS) and stored on secured infrastructure. We retain
            your information for as long as your account is active or as needed to provide the service and meet
            legal obligations, after which it is deleted or anonymised.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Under the Data Protection Act you may request access to, correction of, or deletion of your personal
            data, and may object to certain processing. To exercise these rights, contact us using the details
            below.
          </p>
        </Section>

        <Section title="Cookies & local storage">
          <p>
            We use your device’s local storage to keep you signed in. We don’t use third-party advertising
            trackers.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We may update this policy from time to time. Material changes will be reflected here with a new “last
            updated” date.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions or requests:{' '}
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
