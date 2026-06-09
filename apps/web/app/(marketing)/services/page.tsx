'use client';

import { useEffect, useState } from 'react';
import type { ServiceLineDto } from '@onyxhawk/types';

import { api, apiErrorMessage } from '../../../src/lib/api';
import { Banner, ButtonLink, Card, Pill, Spinner } from '../../../src/components/ui';

export default function ServicesPage() {
  const [lines, setLines] = useState<ServiceLineDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getServiceLines()
      .then((r) => setLines(r.serviceLines))
      .catch((e) => setError(apiErrorMessage(e, 'Could not load services.')));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <h1 className="font-serif text-4xl text-text">Services</h1>
      <p className="mt-3 max-w-xl text-text-muted">
        From a quick standard clean to specialist fumigation — pick what your space needs.
      </p>

      <div className="mt-10">
        {error ? <Banner>{error}</Banner> : null}
        {!lines && !error ? (
          <div className="flex justify-center py-20 text-text-muted">
            <Spinner />
          </div>
        ) : null}
        {lines ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lines.map((line) => (
              <Card key={line.id} className="flex flex-col">
                <div className="flex items-start justify-between">
                  <span
                    className="h-11 w-11 rounded-lg"
                    style={{ backgroundColor: line.colorHex ?? '#C9A55C' }}
                    aria-hidden
                  />
                  {line.badge !== 'NONE' ? (
                    <Pill className="bg-gold-soft text-gold-deep">{badgeLabel(line.badge)}</Pill>
                  ) : null}
                </div>
                <h2 className="mt-4 text-lg font-medium text-text">{line.name}</h2>
                {line.tagline ? <p className="mt-1 text-sm text-text-muted">{line.tagline}</p> : null}
                <div className="mt-4 flex items-center justify-between pt-2">
                  <span className="text-sm text-text-muted">
                    {line.quoteOnly ? 'Custom quote' : 'Book online'}
                  </span>
                  {line.quoteOnly ? (
                    <ButtonLink href="/quote" variant="secondary" size="sm">
                      Get a quote
                    </ButtonLink>
                  ) : (
                    <ButtonLink href="/sign-in" size="sm">
                      Book
                    </ButtonLink>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function badgeLabel(badge: ServiceLineDto['badge']): string {
  switch (badge) {
    case 'MOST_BOOKED':
      return 'Most booked';
    case 'CERTIFIED':
      return 'Certified';
    case 'NEW':
      return 'New';
    default:
      return '';
  }
}
