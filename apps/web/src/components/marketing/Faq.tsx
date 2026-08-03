import { Section, SectionHeading } from '../layout';
import { FAQS } from '../../content/site';

export function Faq() {
  return (
    <Section id="faq">
      <SectionHeading eyebrow="Questions" title="Everything else you might be wondering" align="center" />

      <div className="mx-auto mt-12 max-w-3xl space-y-3">
        {FAQS.map((faq) => (
          <details
            key={faq.q}
            className="group rounded-xl border border-line bg-white px-6 py-5 transition-colors hover:border-gold-bright/45"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-charcoal [&::-webkit-details-marker]:hidden">
              {faq.q}
              <span className="shrink-0 text-xl leading-none text-bronze transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-charcoal-muted">{faq.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
