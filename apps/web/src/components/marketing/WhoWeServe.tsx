import { SurfaceCard, IconChip, Section, SectionHeading } from '../layout';
import { CheckIcon } from '../icons';
import { Icon } from './iconMap';
import { COVERAGE_POINTS, SEGMENTS } from '../../content/site';

export function WhoWeServe() {
  return (
    <Section id="coverage" tone="raised">
      <SectionHeading
        eyebrow="Who we serve"
        title="From a one-bedroom in Kilimani to a hospital wing"
        lead="Four kinds of client, one operating standard — and crews that travel wherever the work is."
      />

      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        {SEGMENTS.map((segment) => (
          <SurfaceCard key={segment.title} interactive>
            <div className="flex gap-4">
              <IconChip>
                <Icon name={segment.icon} />
              </IconChip>
              <div>
                <h3 className="text-base font-semibold text-charcoal">{segment.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-charcoal-muted">{segment.description}</p>

                {segment.areas ? (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {segment.areas.map((area) => (
                      <li
                        key={area}
                        className="rounded-pill border border-line bg-cream px-3 py-1 text-xs text-charcoal-muted"
                      >
                        {area}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </SurfaceCard>
        ))}
      </div>

      {/* Countrywide callout */}
      <div className="mt-8 rounded-xl border border-gold-bright/35 bg-gradient-to-br from-gold/[0.09] to-transparent p-8">
        <h3 className="text-xl font-bold text-charcoal">Cleaning countrywide, not just Nairobi</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-charcoal-muted">
          We mobilise crews for commercial contracts, medical facilities and post-construction handovers anywhere in
          Kenya.
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {COVERAGE_POINTS.map((point) => (
            <li key={point.title} className="flex gap-3">
              <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-bronze" />
              <div>
                <p className="text-sm font-semibold text-charcoal">{point.title}</p>
                <p className="mt-1 text-sm text-charcoal-muted">{point.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
