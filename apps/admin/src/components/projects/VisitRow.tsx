'use client';

import { useState } from 'react';
import type { ProjectVisitDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { visitDateLabel } from '../../lib/projectSchedule';

const STATUS_TEXT: Record<ProjectVisitDto['status'], string> = {
  PLANNED: 'Planned',
  DONE: 'Done',
  SKIPPED: 'Skipped',
};

const STATUS_TONE: Record<ProjectVisitDto['status'], string> = {
  PLANNED: 'bg-mist text-charcoal-muted',
  DONE: 'bg-success/10 text-success',
  SKIPPED: 'bg-warning/15 text-warning',
};

/**
 * One planned visit with buttons to mark it done or skipped, or to undo the
 * mark. Saves straight away and hands the saved visit back.
 */
export function VisitRow({
  visit, showProject = true, showDate = true, onChanged,
}: {
  visit: ProjectVisitDto;
  showProject?: boolean;
  showDate?: boolean;
  onChanged: (visit: ProjectVisitDto) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const mark = async (status: 'DONE' | 'SKIPPED' | null) => {
    setSaving(true);
    setFailed(false);
    try {
      const res = await api.markProjectVisit(visit.projectId, visit.date, { status });
      if (res.visit) onChanged(res.visit);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const btn = 'rounded-lg border border-line px-2.5 py-1 text-xs text-charcoal-muted hover:bg-mist disabled:opacity-50';
  const where = [visit.clientName, visit.siteLocation].filter(Boolean).join(' · ');

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {showDate && <span className="font-medium tabular-nums text-charcoal">{visitDateLabel(visit.date)}</span>}
          {showProject && <span className="text-charcoal">{visit.projectTitle}</span>}
          {visit.isDeepClean && <span className="rounded-full bg-aqua-soft px-2 py-0.5 text-[11px] text-aqua-deep">Deep clean</span>}
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_TONE[visit.status]}`}>{STATUS_TEXT[visit.status]}</span>
        </div>
        {(showProject && where) || visit.markedByName ? (
          <p className="mt-0.5 text-xs text-charcoal-muted">
            {showProject && where}
            {showProject && where && visit.markedByName ? ' · ' : ''}
            {visit.markedByName ? `marked by ${visit.markedByName}` : ''}
          </p>
        ) : null}
        {failed && <p role="alert" className="mt-0.5 text-xs text-danger">Not saved. Try again.</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        {visit.status === 'PLANNED' ? (
          <>
            <button type="button" className={btn} disabled={saving} onClick={() => void mark('DONE')}>Done</button>
            <button type="button" className={btn} disabled={saving} onClick={() => void mark('SKIPPED')}>Skipped</button>
          </>
        ) : (
          <button type="button" className={btn} disabled={saving} onClick={() => void mark(null)}>Undo</button>
        )}
      </div>
    </li>
  );
}
