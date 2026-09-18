/**
 * Checklist rules — pure functions so they are unit-testable.
 *
 *   applies      a conditional must-have counts only once its flag is set
 *   blocker      an applicable must-have that is not done / N/A
 *   overdue      target date passed, status not DONE / BLOCKED / NOT_APPLICABLE
 *   editable     owner and COO always; otherwise the user's role must match
 *                the item's free-text owner by keyword (the pattern the
 *                pipeline uses for household segments)
 */
import type {
  CompanyReadinessFlags,
  CompliancePriority,
  ComplianceStatus,
  ComplianceSummary,
} from '@onyxhawk/types';

export const OPEN_FOR_COST: ComplianceStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED'];
const CLOSED: ComplianceStatus[] = ['DONE', 'NOT_APPLICABLE'];

export function priorityApplies(priority: CompliancePriority, flags: CompanyReadinessFlags): boolean {
  switch (priority) {
    case 'MUST_HAVE_IF_ELIGIBLE': return flags.agpoEligible;
    case 'MUST_HAVE_IF_GO': return flags.laundryGoDecision === 'GO';
    case 'MUST_HAVE_BEFORE_HIRING': return flags.hiringStarted;
    default: return true;
  }
}

export function isMustHave(priority: CompliancePriority): boolean {
  return priority.startsWith('MUST_HAVE');
}

export function isBlocker(priority: CompliancePriority, status: ComplianceStatus, flags: CompanyReadinessFlags): boolean {
  return isMustHave(priority) && priorityApplies(priority, flags) && !CLOSED.includes(status);
}

/** `today` and `targetDate` as YYYY-MM-DD. */
export function isOverdue(targetDate: string, status: ComplianceStatus, today: string): boolean {
  return targetDate < today && status !== 'DONE' && status !== 'BLOCKED' && status !== 'NOT_APPLICABLE';
}

/** Which roles a free-text owner cell names. "BD Lead (COO approves)" → BD lead and COO. */
const OWNER_KEYWORDS: Record<string, RegExp> = {
  COO: /\bcoo\b/i,
  BUSINESS_DEVELOPMENT_LEAD: /\bbd\b|business development/i,
  MARKETING: /\bcomms\b|communications|marketing/i,
  FINANCIAL_MANAGER: /\bfinance\b|financial manager|\bcfo\b/i,
  ADMIN: /\badmin\b/i,
};

export function canEditItem(actor: { role: string; isOwner: boolean }, owner: string): boolean {
  if (actor.isOwner || actor.role === 'COO') return true;
  const pattern = OWNER_KEYWORDS[actor.role];
  return !!pattern && pattern.test(owner);
}

export interface SummaryRow {
  itemNo: number;
  priority: CompliancePriority;
  status: ComplianceStatus;
  targetDate: string;
  costCents: number;
}

export function summarise(rows: SummaryRow[], flags: CompanyReadinessFlags, today: string): ComplianceSummary {
  const counted = rows.filter((r) => r.status !== 'NOT_APPLICABLE' && priorityApplies(r.priority, flags));
  const done = counted.filter((r) => r.status === 'DONE').length;
  const blockers = rows.filter((r) => isBlocker(r.priority, r.status, flags)).map((r) => r.itemNo).sort((a, b) => a - b);
  const overdue = rows.filter((r) => priorityApplies(r.priority, flags) && isOverdue(r.targetDate, r.status, today)).length;
  const blocked = rows.filter((r) => priorityApplies(r.priority, flags) && r.status === 'BLOCKED').length;
  return {
    total: counted.length,
    done,
    percent: counted.length === 0 ? 0 : Math.round((done / counted.length) * 100),
    blockers,
    problems: overdue + blocked,
    overdue,
    remainingCostCents: rows.filter((r) => OPEN_FOR_COST.includes(r.status)).reduce((a, r) => a + r.costCents, 0),
  };
}
