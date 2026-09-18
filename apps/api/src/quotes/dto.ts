/**
 * Quote request → admin DTO, with the survey and (for roles allowed to see
 * it) the current estimate. Shared by the admin and quote-builder routes so
 * both return the same shape.
 */
import type { Prisma } from '@prisma/client';
import type {
  AdminQuoteRequestDto,
  EstimateStatus,
  QuoteEstimateDto,
  QuoteEstimateOutput,
  QuoteFrequency,
  QuoteStatus,
  QuoteSurveyAreaInput,
  QuoteSurveyDto,
  QuoteSurveyItemInput,
  ServiceLineCode,
} from '@onyxhawk/types';

const person = { select: { fullName: true } } as const;

/**
 * The newest estimate that has not been superseded is the quote's current
 * one; there is at most one because every recompute supersedes the rest.
 */
export const adminQuoteInclude = {
  serviceLine: true,
  user: { select: { fullName: true, phone: true } },
  survey: { include: { updatedBy: person } },
  estimates: {
    where: { status: { not: 'SUPERSEDED' } },
    orderBy: { computedAt: 'desc' },
    take: 1,
    include: { computedBy: person, submittedBy: person, decidedBy: person },
  },
} satisfies Prisma.QuoteRequestInclude;

export type AdminQuoteRow = Prisma.QuoteRequestGetPayload<{ include: typeof adminQuoteInclude }>;

export function toSurveyDto(s: NonNullable<AdminQuoteRow['survey']>): QuoteSurveyDto {
  return {
    distanceZone: s.distanceZone,
    soilLevel: s.soilLevel,
    frequencyLabel: s.frequencyLabel,
    workingWindowHours: s.workingWindowHours,
    supervisorOnSite: s.supervisorOnSite,
    traineeSourced: s.traineeSourced,
    notes: s.notes,
    areas: s.areas as unknown as QuoteSurveyAreaInput[],
    items: s.items as unknown as QuoteSurveyItemInput[],
    updatedByName: s.updatedBy?.fullName ?? null,
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function toEstimateDto(e: AdminQuoteRow['estimates'][number]): QuoteEstimateDto {
  return {
    id: e.id,
    status: e.status as EstimateStatus,
    output: e.output as unknown as QuoteEstimateOutput,
    ratesUpdatedAt: e.ratesUpdatedAt?.toISOString() ?? null,
    computedAt: e.computedAt.toISOString(),
    computedByName: e.computedBy?.fullName ?? null,
    submittedAt: e.submittedAt?.toISOString() ?? null,
    submittedByName: e.submittedBy?.fullName ?? null,
    decidedAt: e.decidedAt?.toISOString() ?? null,
    decidedByName: e.decidedBy?.fullName ?? null,
    decisionNote: e.decisionNote,
  };
}

/**
 * @param includeEstimate whether the caller may see internal figures. The
 * client-facing price and the approval trail are safe for every staff role.
 */
export function toAdminQuoteDto(row: AdminQuoteRow, includeEstimate: boolean): AdminQuoteRequestDto {
  const current = row.estimates[0] ?? null;
  const output = current ? (current.output as unknown as QuoteEstimateOutput) : null;
  const approved = current?.status === 'APPROVED';

  return {
    id: row.id,
    serviceLineCode: row.serviceLine.code as ServiceLineCode,
    serviceLineName: row.serviceLine.name,
    siteType: row.siteType,
    approxSqm: row.approxSqm,
    floors: row.floors,
    frequency: row.frequency as QuoteFrequency,
    notes: row.notes,
    status: row.status as QuoteStatus,
    quotedAmountCents: row.quotedAmountCents,
    quotedAt: row.quotedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    customerName: row.user.fullName,
    customerPhone: row.user.phone,
    survey: row.survey ? toSurveyDto(row.survey) : null,
    estimate: current && includeEstimate ? toEstimateDto(current) : null,
    approvedPricePerVisitCents: approved && output ? output.pricing.pricePerVisitCents : null,
    submittedForApprovalAt: current?.submittedAt?.toISOString() ?? null,
    submittedForApprovalByName: current?.submittedBy?.fullName ?? null,
    approvedAt: approved ? current.decidedAt?.toISOString() ?? null : null,
    approvedByName: approved ? current.decidedBy?.fullName ?? null : null,
    approvalNote: current?.decisionNote ?? null,
  };
}
