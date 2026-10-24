'use client';

import { useId, useRef } from 'react';
import type { PublicWebsiteJobDto } from '@onyxhawk/types';

import { Photo } from '../Photo';
import { CameraIcon, PinIcon } from '../icons';
import { formatMonthYear } from '../../lib/format';
import { CLIENT_SEGMENT_LABEL } from '../../content/site';

/**
 * One published job: the first photo as a cover with the photo count, then
 * the job's details. Selecting the card opens a native dialog with every
 * photo; the browser handles Escape and keeps focus inside while it is open.
 */
export function JobCard({ job }: { job: PublicWebsiteJobDto }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const client = CLIENT_SEGMENT_LABEL[job.clientSegment];
  // A service dropped from the catalog has no name; the client type stands in.
  const title = `${job.serviceName ?? client} job in ${job.area}`;
  const count = job.photos.length;
  const countLabel = `${count} ${count === 1 ? 'photo' : 'photos'}`;

  return (
    <article className="group relative flex h-full flex-col">
      {/* The button's ::after stretches over the whole card, so all of it opens the photos. */}
      <button
        ref={openerRef}
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        aria-label={`View ${countLabel}: ${title}`}
        className="block text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-aqua-deep"
      >
        <span className="relative block">
          <Photo
            slot={{ src: job.photos[0]?.url ?? null, alt: title, placeholder: title }}
            className="aspect-[4/3]"
            imgClassName="transition-transform duration-500 group-hover:scale-105"
          />
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-pill bg-white/90 px-3 py-1 text-xs font-medium text-charcoal shadow-sm">
            <CameraIcon className="h-4 w-4" />
            {countLabel}
          </span>
        </span>
      </button>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs">
        <span className="rounded-pill bg-navy-soft px-3 py-1 font-semibold text-navy">{client}</span>
        <time dateTime={job.completedOn} className="text-charcoal-muted">
          {formatMonthYear(job.completedOn)}
        </time>
      </div>
      {job.serviceName ? <h3 className="mt-3 text-base font-semibold text-charcoal">{job.serviceName}</h3> : null}
      <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-charcoal-muted">
        <PinIcon className="h-4 w-4 shrink-0 text-aqua-deep" />
        {job.area}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-charcoal-muted">{job.description}</p>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => openerRef.current?.focus()}
        className="w-[calc(100%-2rem)] max-w-3xl rounded-xl bg-white p-0 shadow-xl backdrop:bg-charcoal/70"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-white px-5 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-charcoal">
              {title}
            </h2>
            <p className="text-xs text-charcoal-muted">
              {client} · {formatMonthYear(job.completedOn)} · {countLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="h-11 min-w-11 shrink-0 rounded-pill border border-line px-4 text-sm font-semibold text-charcoal transition hover:border-navy hover:bg-navy hover:text-white"
          >
            Close
          </button>
        </div>

        <ul className="space-y-4 p-5">
          {job.photos.map((photo, i) => (
            <li key={photo.url}>
              <Photo slot={{ src: photo.url, alt: `${title}, photo ${i + 1} of ${count}`, placeholder: title }} />
            </li>
          ))}
        </ul>
      </dialog>
    </article>
  );
}
