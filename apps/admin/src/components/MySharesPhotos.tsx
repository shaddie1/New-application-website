'use client';

import type { PublicWebsiteJobDto } from '@onyxhawk/types';

import { SectionHeading } from './MySharesSections';
import { calendarDate, type PeriodView } from './MySharesPeriod';

/** The strip shows this many covers at most; the rest are counted as "+N more". */
const MAX_PHOTOS = 12;

/**
 * Photos of jobs completed in the selected period and published to the
 * website: each job's cover only, newest first. Renders nothing
 * while the list is loading or after it failed (`jobs` null), and nothing for
 * a period with no such jobs, so the rest of the page never depends on it.
 * Photos are not links; they scroll sideways on screen and wrap into a grid
 * on paper, and load eagerly so a print made straight away has them.
 */
export function MySharesPhotos({ jobs, view }: { jobs: PublicWebsiteJobDto[] | null; view: PeriodView }) {
  if (!jobs) return null;

  const range = view.range;
  const inPeriod = jobs
    .filter((job) => job.photos.length > 0)
    .filter((job) => !range || (job.completedOn >= range.from && job.completedOn <= range.to))
    .sort((a, b) => b.completedOn.localeCompare(a.completedOn));
  if (inPeriod.length === 0) return null;

  const shown = inPeriod.slice(0, MAX_PHOTOS);
  const more = inPeriod.length - shown.length;

  return (
    <section>
      <SectionHeading title="Published jobs">
        {view.kind === 'allTime'
          ? 'Every job shown on the OnyxHawk website, newest first.'
          : `Jobs completed in ${view.phrase} and shown on the OnyxHawk website, newest first.`}
      </SectionHeading>

      <ul className="flex snap-x gap-3 overflow-x-auto pb-2 print:grid print:grid-cols-4 print:overflow-visible print:pb-0">
        {shown.map((job) => {
          const name = job.serviceName ?? humanise(job.serviceLineCode);
          return (
            <li key={job.id} className="w-44 shrink-0 snap-start sm:w-52 print:w-auto">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={job.photos[0]!.url}
                  alt={`${name} job in ${job.area}, completed ${calendarDate(job.completedOn)}`}
                  loading="eager"
                  className="aspect-[4/3] w-full rounded-lg bg-mist object-cover"
                />
                <figcaption className="mt-1.5 text-xs">
                  <span className="block truncate font-medium text-charcoal">{name}</span>
                  <span className="block truncate text-charcoal-muted">
                    {job.area}, {calendarDate(job.completedOn)}
                  </span>
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>
      {more > 0 && <p className="mt-2 text-sm text-charcoal-muted">+{more} more</p>}
    </section>
  );
}

/** A code no longer in the catalog: "post_build" → "Post build". */
function humanise(code: string): string {
  const spaced = code.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
