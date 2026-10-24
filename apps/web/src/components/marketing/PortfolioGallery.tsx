'use client';

import { useState } from 'react';
import type { ClientSegment, PublicWebsiteJobDto } from '@onyxhawk/types';

import { cn } from '../../lib/cn';
import { JobCard } from './JobCard';
import { CLIENT_SEGMENT_LABEL } from '../../content/site';

type Filter = ClientSegment | 'ALL';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  ...(Object.entries(CLIENT_SEGMENT_LABEL) as [ClientSegment, string][]).map(([value, label]) => ({
    value,
    label,
  })),
];

/**
 * Every published job, in the API's newest-first order, filterable by client
 * type. Each type keeps its chip even with no jobs yet, and choosing it says
 * so in one line rather than leaving an empty grid.
 */
export function PortfolioGallery({ jobs }: { jobs: PublicWebsiteJobDto[] }) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const shown = filter === 'ALL' ? jobs : jobs.filter((job) => job.clientSegment === filter);
  const notice =
    filter === 'ALL'
      ? 'No jobs to show yet.'
      : `No ${CLIENT_SEGMENT_LABEL[filter].toLowerCase()} jobs to show yet.`;

  return (
    <>
      <div role="group" aria-label="Filter by client type" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'h-11 rounded-pill border px-5 text-sm font-medium transition',
              filter === f.value
                ? 'border-navy bg-navy text-white'
                : 'border-line bg-white text-charcoal hover:border-aqua',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <ul className="mt-8 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((job) => (
            <li key={job.id}>
              <JobCard job={job} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 rounded-xl border border-line bg-white px-6 py-5 text-sm text-charcoal-muted">{notice}</p>
      )}
    </>
  );
}
