import { IconChip, Section, SectionHeading } from '../layout';
import { Icon } from './iconMap';
import { HOW_IT_WORKS } from '../../content/site';

/**
 * A connected flow rather than a card grid — deliberately unlike the services
 * section, so the page reads as "steps" at a glance. The connector is a
 * horizontal rail on large screens and a vertical spine on small ones.
 */
export function HowItWorks() {
  return (
    <Section id="how-it-works" tone="raised">
      <SectionHeading
        eyebrow="How it works"
        title="Booked in minutes, cleaned the same day"
        lead="Five steps from picking a service to earning points on the finished job."
        align="center"
      />

      <ol className="relative mt-14 grid gap-8 lg:grid-cols-5 lg:gap-6">
        {/* Rail: vertical on mobile, horizontal across the icons on desktop. */}
        <span
          aria-hidden="true"
          className="absolute left-[1.37rem] top-2 h-[calc(100%-1rem)] w-px bg-gradient-to-b from-gold/40 via-gold/20 to-transparent lg:left-0 lg:top-[1.37rem] lg:h-px lg:w-full lg:bg-gradient-to-r"
        />

        {HOW_IT_WORKS.map((step, index) => (
          <li key={step.title} className="relative flex gap-5 lg:block">
            <div className="relative shrink-0">
              <IconChip className="border border-gold/25 bg-ink shadow-sm">
                <Icon name={step.icon} />
              </IconChip>
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-pill bg-gold text-[11px] font-bold text-ink">
                {index + 1}
              </span>
            </div>

            <div className="lg:mt-5">
              <h3 className="text-base font-semibold text-text-on-dark">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-text-on-dark-muted lg:pr-4">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
