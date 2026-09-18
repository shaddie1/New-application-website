/**
 * Probation tracker — the two trainees' workplans (Learning_Comms /
 * Learning_BD), the reporting calendar, and the KPI scorecard with its
 * computed outcome. Fixed-duration process: 5 Oct 2026 – 8 Jan 2027.
 */

export type ProbationRole = 'COMMS' | 'BD';

export const PROBATION_ROLE_LABEL: Record<ProbationRole, string> = {
  COMMS: 'Communications and Marketing Manager',
  BD: 'Business Development Lead and Site Supervisor',
};

// ── Workplan ────────────────────────────────────────────────────────────────

/** The sheet's key: S = stage, T = task, ST = ongoing (standing) task, D = deliverable. */
export type WorkplanTaskType = 'STAGE' | 'TASK' | 'ONGOING' | 'DELIVERABLE';

/** The sheet's five-value dropdown. */
export type WorkplanStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'HELD';

export type WorkplanEventKind = 'SEEDED' | 'STATUS_CHANGED' | 'NOTE_ADDED';

export interface WorkplanEventDto {
  id: string;
  kind: WorkplanEventKind;
  fromStatus: WorkplanStatus | null;
  toStatus: WorkplanStatus | null;
  summary: string;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface WorkplanTaskDto {
  id: string;
  role: ProbationRole;
  /** "A", "A.1", … Stage rows carry the bare letter. */
  taskNo: string;
  type: WorkplanTaskType;
  activity: string;
  category: string | null;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
  outputRequired: string | null;
  status: WorkplanStatus;
  /** Activity text begins "Decision Gate" — a review gate on the sheet. */
  isDecisionGate: boolean;
  /** End date passed and status not DONE / HELD. */
  overdue: boolean;
  /** Whether the requesting user may change this task's status. */
  editable: boolean;
  eventCount: number;
  updatedAt: string;
}

export interface ChangeWorkplanStatusInput {
  status: WorkplanStatus;
  note?: string;
}

// ── Reporting calendar ──────────────────────────────────────────────────────

export interface ReportingEventDto {
  id: string;
  date: string; // YYYY-MM-DD
  day: string;
  event: string;
  who: string;
  /** "5:00 pm" or "Meeting". */
  due: string;
  reviewer: string;
  submitted: boolean;
  submittedAt: string | null;
  submittedByName: string | null;
  reviewed: boolean;
  reviewedAt: string | null;
  reviewedByName: string | null;
  /** Date passed and not submitted. */
  overdue: boolean;
}

export interface MarkReportingEventInput {
  submitted?: boolean;
  reviewed?: boolean;
}

// ── KPI scorecard ───────────────────────────────────────────────────────────

export interface KpiRowDto {
  id: string;
  role: ProbationRole;
  kpiName: string;
  /** Integer; the role's weights sum to 100. */
  weight: number;
  /** Month (YYYY-MM) → target. Columns are whatever months have targets. */
  targets: Record<string, number>;
  /** Month → actual, where entered. Omitted entirely for users who may not see actuals. */
  actuals: Record<string, number>;
  sumTargets: number;
  sumActuals: number;
  /** weight × min(1, Σactuals ÷ Σtargets); or weight if no target and any actual. */
  score: number;
}

export type ProbationDecision = 'CONFIRM' | 'EXTEND_ONE_MONTH' | 'NOT_CONFIRMED';

export const PROBATION_DECISION_LABEL: Record<ProbationDecision, string> = {
  CONFIRM: 'Confirm',
  EXTEND_ONE_MONTH: 'Extend 1 month',
  NOT_CONFIRMED: 'Not confirmed',
};

export interface ProbationScorecardDto {
  role: ProbationRole;
  /** Months with targets, sorted. */
  months: string[];
  kpis: KpiRowDto[];
  totalWeight: number;
  /** Σ score ÷ Σ weight, 0–1. */
  weightedScore: number;
  criticalBreach: boolean;
  /** Computed from the score and the breach flag. */
  outcome: ProbationDecision;
  /** The CEO's recorded final decision, if made. */
  finalDecision: ProbationDecision | null;
  finalDecisionNote: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
}

export interface SetKpiActualInput {
  month: string; // YYYY-MM
  /** Null clears the entry. */
  actual: number | null;
}

export interface SetKpiTargetInput {
  month: string;
  target: number;
}

export interface SetCriticalBreachInput {
  criticalBreach: boolean;
  note?: string;
}

export interface SetFinalDecisionInput {
  finalDecision: ProbationDecision | null;
  note?: string;
}

// ── Page payload ────────────────────────────────────────────────────────────

export interface ProbationAccess {
  /** Which workplans the user sees. */
  roles: ProbationRole[];
  canEditCalendar: boolean;
  canSeeScorecard: boolean;
  canEditActuals: boolean;
  canSetBreach: boolean;
  canDecide: boolean;
}

export interface ProbationDto {
  probationStart: string;
  probationEnd: string;
  decisionLetterBy: string;
  access: ProbationAccess;
  tasks: WorkplanTaskDto[];
  calendar: ReportingEventDto[];
  /** Absent for users who may not see the scorecard. */
  scorecards: ProbationScorecardDto[] | null;
}
