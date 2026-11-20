import type { ProjectVisitDto } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { plannedVisits, type ProjectSchedule } from './schedule.js';

/** A stored project's schedule. */
export function scheduleOf(row: {
  kind: ProjectSchedule['kind'];
  startDate: Date | null;
  targetEndDate: Date | null;
  repeatEvery: number | null;
  repeatUnit: ProjectSchedule['repeatUnit'];
  serviceDays: number[];
  weekOfMonth: number | null;
  deepCleanEveryMonths: number | null;
}): ProjectSchedule {
  return {
    kind: row.kind,
    startDate: row.startDate ? row.startDate.toISOString().slice(0, 10) : null,
    endDate: row.targetEndDate ? row.targetEndDate.toISOString().slice(0, 10) : null,
    repeatEvery: row.repeatEvery,
    repeatUnit: row.repeatUnit,
    serviceDays: row.serviceDays,
    weekOfMonth: row.weekOfMonth,
    deepCleanEveryMonths: row.deepCleanEveryMonths,
  };
}

/**
 * The visits from one date to another, both included, in date order: each
 * planned visit of an open project with its mark if it has one, plus any marked
 * visit the schedule no longer has, so a record of work done is never hidden.
 * With `projectId`, that project's visits only, whatever its stage.
 */
export async function visitsBetween(from: string, to: string, projectId?: string): Promise<ProjectVisitDto[]> {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const projects = await prisma.project.findMany({
    where: projectId
      ? { id: projectId }
      : {
          stage: { notIn: ['COMPLETE', 'CANCELLED'] },
          startDate: { not: null, lte: toDate },
          OR: [{ kind: 'REPEATING', OR: [{ targetEndDate: null }, { targetEndDate: { gte: fromDate } }] }, { kind: 'ONCE', startDate: { gte: fromDate } }],
        },
  });
  const marks = await prisma.projectVisit.findMany({
    where: { date: { gte: fromDate, lte: toDate }, ...(projectId ? { projectId } : {}) },
    include: { markedBy: { select: { fullName: true } }, project: true },
  });
  const markOf = new Map(marks.map((m) => [`${m.projectId}|${m.date.toISOString().slice(0, 10)}`, m]));

  const out: ProjectVisitDto[] = [];
  const seen = new Set<string>();
  for (const p of projects) {
    for (const v of plannedVisits(scheduleOf(p), from, to)) {
      const key = `${p.id}|${v.date}`;
      const mark = markOf.get(key);
      seen.add(key);
      out.push({
        projectId: p.id,
        projectTitle: p.title,
        clientName: p.clientName,
        siteLocation: p.siteLocation,
        date: v.date,
        isDeepClean: v.isDeepClean,
        status: mark?.status ?? 'PLANNED',
        note: mark?.note ?? null,
        markedByName: mark?.markedBy?.fullName ?? null,
      });
    }
  }
  for (const [key, m] of markOf) {
    if (seen.has(key)) continue;
    out.push({
      projectId: m.projectId,
      projectTitle: m.project.title,
      clientName: m.project.clientName,
      siteLocation: m.project.siteLocation,
      date: m.date.toISOString().slice(0, 10),
      isDeepClean: m.isDeepClean,
      status: m.status,
      note: m.note,
      markedByName: m.markedBy?.fullName ?? null,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.projectTitle.localeCompare(b.projectTitle));
}
