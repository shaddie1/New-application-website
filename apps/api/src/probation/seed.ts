/**
 * Seeds the workplans, reporting calendar and KPI definitions/targets from
 * PROBATION_SEED (a verbatim extraction of the sheets). Idempotent: rows are
 * created only where missing; statuses, ticks and actuals are never touched.
 */
import type { ProbationRole, WorkplanStatus, WorkplanTaskType } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { PROBATION_SEED } from './seed-data.js';

/** Sheet role names → the enum. */
export function roleFor(sheetRole: string): ProbationRole {
  return /business development|bd lead/i.test(sheetRole) ? 'BD' : 'COMMS';
}

/** The sheet's key: S = stage, T = task, ST = ongoing (standing) task, D = deliverable. */
const TYPE: Record<string, WorkplanTaskType> = { S: 'STAGE', T: 'TASK', ST: 'ONGOING', D: 'DELIVERABLE' };
const STATUS: Record<string, WorkplanStatus> = {
  'Not started': 'NOT_STARTED', 'In progress': 'IN_PROGRESS', Done: 'DONE', Blocked: 'BLOCKED', Held: 'HELD',
};

/** "Oct2026" → "2026-10". */
export function monthKey(label: string): string {
  const m = /^([A-Za-z]{3})(\d{4})$/.exec(label);
  if (!m) throw new Error(`unrecognised month label "${label}"`);
  const idx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1]!.toLowerCase());
  if (idx < 0) throw new Error(`unrecognised month label "${label}"`);
  return `${m[2]}-${String(idx + 1).padStart(2, '0')}`;
}

/**
 * The sheet has one stray note cell at the foot of the Comms plan — its whole
 * content sits in the "no" column with no type or dates. It is kept verbatim
 * as an undated ongoing row labelled "Note", in the sheet's position, rather
 * than dropped.
 */
interface RawTask {
  no: string;
  type: string | null;
  activity: string | null;
  category: string | null;
  start: string | null;
  end: string | null;
  outputRequired: string | null;
  status: string;
}

function normaliseTask(t: RawTask) {
  if (!t.type) {
    return {
      taskNo: 'Note',
      type: 'ONGOING' as WorkplanTaskType,
      activity: t.activity ?? t.no,
      category: t.category,
      start: t.start,
      end: t.end,
      outputRequired: t.outputRequired,
      status: STATUS[t.status] ?? 'NOT_STARTED',
    };
  }
  return {
    taskNo: t.no,
    type: TYPE[t.type] ?? ('TASK' as WorkplanTaskType),
    activity: t.activity ?? t.no,
    category: t.category,
    start: t.start,
    end: t.end,
    outputRequired: t.outputRequired,
    status: STATUS[t.status] ?? ('NOT_STARTED' as WorkplanStatus),
  };
}

export async function seedProbation(): Promise<{ tasks: number; events: number; kpis: number }> {
  let tasks = 0;
  let events = 0;
  let kpis = 0;

  // Runs on every read, so bail out fast once everything is in place.
  const expectedTasks = PROBATION_SEED.workplans.reduce((a, w) => a + w.tasks.length, 0);
  const [haveTasks, haveCalendar, haveKpis, haveOutcomes] = await Promise.all([
    prisma.workplanTask.count(), prisma.reportingEvent.count(), prisma.kpiDefinition.count(), prisma.probationOutcome.count(),
  ]);
  if (haveTasks >= expectedTasks && haveCalendar >= PROBATION_SEED.reportingCalendar.length && haveKpis >= PROBATION_SEED.kpiScorecard.length && haveOutcomes >= 2) {
    return { tasks: 0, events: 0, kpis: 0 };
  }

  // ── Workplans ─────────────────────────────────────────────────────────────
  for (const plan of PROBATION_SEED.workplans) {
    const role = roleFor(plan.role);
    const existing = new Set((await prisma.workplanTask.findMany({ where: { role }, select: { taskNo: true } })).map((r) => r.taskNo));
    for (const [i, raw] of (plan.tasks as readonly RawTask[]).entries()) {
      const t = normaliseTask(raw);
      if (existing.has(t.taskNo)) continue;
      await prisma.workplanTask.create({
        data: {
          role,
          taskNo: t.taskNo,
          type: t.type,
          activity: t.activity,
          category: t.category,
          startDate: t.start ? new Date(t.start) : null,
          endDate: t.end ? new Date(t.end) : null,
          outputRequired: t.outputRequired,
          status: t.status,
          sortOrder: i,
          events: { create: { kind: 'SEEDED', toStatus: t.status, summary: 'Seeded from the workplan sheet' } },
        },
      });
      tasks++;
    }
  }

  // ── Reporting calendar ────────────────────────────────────────────────────
  const haveEvents = await prisma.reportingEvent.count();
  if (haveEvents === 0) {
    for (const [i, e] of PROBATION_SEED.reportingCalendar.entries()) {
      await prisma.reportingEvent.create({
        data: { date: new Date(e.date), day: e.day, event: e.event, who: e.who, due: e.due, reviewer: e.reviewer, submitted: e.submitted, reviewed: e.reviewed, sortOrder: i },
      });
      events++;
    }
  }

  // ── KPI definitions and targets ───────────────────────────────────────────
  for (const [i, k] of PROBATION_SEED.kpiScorecard.entries()) {
    const role = roleFor(k.role);
    const def = await prisma.kpiDefinition.upsert({
      where: { role_kpiName: { role, kpiName: k.kpi } },
      create: { role, kpiName: k.kpi, weight: k.weight, sortOrder: i },
      update: {},
    });
    for (const [label, target] of Object.entries(k.targets)) {
      const month = monthKey(label);
      const created = await prisma.kpiMonthlyTarget.upsert({
        where: { kpiId_month: { kpiId: def.id, month } },
        create: { kpiId: def.id, month, target },
        update: {},
      });
      if (created) kpis++;
    }
  }
  for (const role of ['COMMS', 'BD'] as const) {
    await prisma.probationOutcome.upsert({ where: { role }, create: { role }, update: {} });
  }

  return { tasks, events, kpis };
}
