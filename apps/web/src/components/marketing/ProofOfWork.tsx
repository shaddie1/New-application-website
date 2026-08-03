import { Section, SectionHeading } from '../layout';
import { Photo } from '../Photo';
import { SITE_PHOTOS } from '../../content/site';

/**
 * Real job photos. The site claims photo proof on every visit, so showing
 * actual work — rather than stock imagery — is the point of this section.
 */
export function ProofOfWork() {
  return (
    <Section id="our-work" tone="raised">
      <SectionHeading
        eyebrow="Our work"
        title="Real crews, real jobs, real results"
        lead="Every visit is documented with before-and-after photos saved to your booking — so you can see the standard even when you are not there."
        align="center"
      />

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <figure>
          <Photo slot={SITE_PHOTOS.upholstery} className="aspect-[3/4]" />
          <figcaption className="mt-3 text-sm text-charcoal-muted">
            Upholstery deep clean in progress — foam treatment worked into the fabric.
          </figcaption>
        </figure>

        <figure>
          <Photo slot={SITE_PHOTOS.detail} className="aspect-[3/4]" />
          <figcaption className="mt-3 text-sm text-charcoal-muted">
            Protective gloves, eco-friendly products, and attention to every seam.
          </figcaption>
        </figure>

        <figure className="sm:col-span-2 lg:col-span-1">
          <Photo slot={SITE_PHOTOS.proofResult} className="aspect-[3/4]" />
          <figcaption className="mt-3 text-sm text-charcoal-muted">
            The finished armchair, back in place and ready to use.
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}
