import Link from 'next/link';

import { Section, SectionHeading } from '../layout';
import { ArrowRightIcon } from '../icons';
import { JobCard } from './JobCard';
import { getPublishedJobs } from '../../lib/websiteJobs';

/** How many jobs the homepage shows; the portfolio has every one. */
const HOMEPAGE_JOBS = 4;

/**
 * The newest published jobs, built into the page. Publishing a job in admin
 * rebuilds the site, so this stays current without a fetch on each visit.
 * With nothing published the section is left out rather than shown empty.
 */
export async function ProofOfWork() {
  const jobs = (await getPublishedJobs()).slice(0, HOMEPAGE_JOBS);
  if (jobs.length === 0) return null;

  return (
    <Section id="our-work" tone="raised">
      <SectionHeading
        eyebrow="Our work"
        title="Real crews, real jobs, real results"
        lead="Every visit is documented with before-and-after photos saved to your booking — so you can see the standard even when you are not there."
        align="center"
      />

      <ul className="mt-12 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {jobs.map((job) => (
          <li key={job.id}>
            <JobCard job={job} />
          </li>
        ))}
      </ul>

      <div className="mt-10 text-center">
        <Link
          href="/portfolio"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-aqua-deep transition-colors hover:text-charcoal"
        >
          See all our work
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    </Section>
  );
}
