'use client';

import { useEffect, useState } from 'react';
import type { ProjectVisitDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { addDays, nairobiToday } from '../../lib/projectSchedule';
import { VisitRow } from '../projects/VisitRow';
import { Card } from '../ui/card';
import { TextLink } from './TextLink';

/** How many days the list covers, today included. */
const DAYS = 7;

/**
 * The project services due today and over the next six days, each with Done /
 * Skipped buttons. Past days are on each project's Visits tab.
 */
export function ServicesDue() {
  const [visits, setVisits] = useState<ProjectVisitDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const today = nairobiToday();

  useEffect(() => {
    let live = true;
    api
      .projectVisits(today, addDays(today, DAYS - 1))
      .then((r) => { if (live) setVisits(r.visits); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [today]);

  const replace = (v: ProjectVisitDto) =>
    setVisits((prev) => prev?.map((x) => (x.projectId === v.projectId && x.date === v.date ? v : x)) ?? prev);

  const dueToday = (visits ?? []).filter((v) => v.date === today);
  const later = (visits ?? []).filter((v) => v.date !== today);

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-serif text-lg text-charcoal">Services due</h2>
        <TextLink href="/calendar">Calendar</TextLink>
      </div>
      {failed ? (
        <p className="text-sm text-danger">Could not load the services due.</p>
      ) : visits === null ? (
        <p className="text-sm text-charcoal-muted">Loading…</p>
      ) : visits.length === 0 ? (
        <p className="text-sm text-charcoal-muted">No project services in the next 7 days.</p>
      ) : (
        <div className="space-y-4">
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-charcoal-muted">Today</p>
            {dueToday.length === 0 ? (
              <p className="text-sm text-charcoal-muted">Nothing due today.</p>
            ) : (
              <ul className="space-y-2">
                {dueToday.map((v) => <VisitRow key={`${v.projectId}|${v.date}`} visit={v} showDate={false} onChanged={replace} />)}
              </ul>
            )}
          </section>
          {later.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-charcoal-muted">Next 6 days</p>
              <ul className="space-y-2">
                {later.map((v) => <VisitRow key={`${v.projectId}|${v.date}`} visit={v} onChanged={replace} />)}
              </ul>
            </section>
          )}
        </div>
      )}
    </Card>
  );
}
