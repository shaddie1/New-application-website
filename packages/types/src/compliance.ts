/**
 * Compliance checklist — the 56 items from the Compliance sheet, their
 * status history, and the company readiness flags that decide which
 * conditional must-haves currently apply. Money in cents.
 */

export type CompliancePriority =
  | 'MUST_HAVE'
  | 'MUST_HAVE_IF_ELIGIBLE'
  | 'MUST_HAVE_IF_GO'
  | 'MUST_HAVE_BEFORE_HIRING'
  | 'RECOMMENDED'
  | 'OPTIONAL';

export type ComplianceStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'NOT_APPLICABLE';

export type LaundryGoDecision = 'PENDING' | 'GO' | 'NO_GO';

/** Category tabs, in sheet order. */
export const COMPLIANCE_CATEGORIES = [
  'Legal', 'Finance', 'Tenders', 'Insurance', 'Compliance', 'People', 'Brand', 'Tools', 'Operations', 'Growth', 'Laundry',
] as const;
export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number];

export type ComplianceEventKind = 'SEEDED' | 'STATUS_CHANGED' | 'DETAILS_CHANGED' | 'NOTE_ADDED';

/** Same shape as Projects' activity log, plus the from/to status. */
export interface ComplianceEventDto {
  id: string;
  kind: ComplianceEventKind;
  fromStatus: ComplianceStatus | null;
  toStatus: ComplianceStatus | null;
  summary: string;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface ComplianceItemDto {
  id: string;
  itemNo: number;
  category: string;
  itemAction: string;
  priority: CompliancePriority;
  whyItMatters: string | null;
  /** Free text as on the sheet: "CEO", "COO + Comms", "BD Lead (COO approves)". */
  owner: string;
  targetDate: string; // YYYY-MM-DD
  costCents: number;
  /** "Free", "Annual", "Quote required", "Per person", "In Financial Plan", … */
  costType: string;
  status: ComplianceStatus;
  dateDone: string | null; // YYYY-MM-DD
  sourceOrNote: string | null;
  /** Why it is blocked — required when the status is BLOCKED. */
  statusNote: string | null;
  /** Whether the priority currently applies, given the readiness flags. */
  applies: boolean;
  /** A must-have that applies and is not done or N/A. */
  isBlocker: boolean;
  /** Target date passed and status not DONE / BLOCKED / NOT_APPLICABLE. */
  overdue: boolean;
  /** Whether the requesting user may change this item's status. */
  editable: boolean;
  eventCount: number;
  updatedAt: string;
}

export interface CompanyReadinessFlags {
  agpoEligible: boolean;
  laundryGoDecision: LaundryGoDecision;
  hiringStarted: boolean;
}

export interface CompanyReadinessFlagsDto extends CompanyReadinessFlags {
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface ComplianceSummary {
  /** Items that apply and are not N/A. */
  total: number;
  done: number;
  percent: number;
  /** Applicable must-haves still open, in item order. */
  blockers: number[];
  /** Open items that are BLOCKED or overdue — what turns the bar red. */
  problems: number;
  overdue: number;
  /** Sum of costCents for items not DONE / NOT_APPLICABLE. */
  remainingCostCents: number;
}

export interface ComplianceChecklistDto {
  items: ComplianceItemDto[];
  flags: CompanyReadinessFlagsDto;
  summary: ComplianceSummary;
  /** Whether the requesting user may change the readiness flags. */
  canEditFlags: boolean;
}

export interface ChangeComplianceStatusInput {
  status: ComplianceStatus;
  /** Required for BLOCKED. */
  note?: string;
  /** Defaults to today when marking DONE. */
  dateDone?: string | null;
}

export interface UpdateComplianceItemInput {
  owner?: string;
  targetDate?: string;
  costCents?: number;
  costType?: string;
  sourceOrNote?: string | null;
}
