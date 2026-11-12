import type {
  Session,
  AdminStats,
  AdminBookingDto,
  AdminQuoteRequestDto,
  CrewUserDto,
  AssignCrewInput,
  RespondQuoteInput,
  AdminStaffDto,
  CreateStaffInput,
  UpdateStaffInput,
  AdminRequestOtpResult,
  ExpenseDto,
  CreateExpenseInput,
  FinancialSummary,
  JobDto,
  CreateJobInput,
  UpdateJobInput,
  ApproveReportInput,
  PlaceJobsInput,
  CreateJobReportInput,
  MonthlyTrendItem,
  ShareholderDto,
  UpdateShareholderInput,
  ReplaceStakesInput,
  ReplaceStakesResult,
  EquityOverview,
  EquityHistory,
  AllTimeTotals,
  MarketingSpendDto,
  CreateMarketingSpendInput,
  AssetDto,
  CreateAssetInput,
  CreateAssetMaintenanceInput,
  InvestmentDto,
  CreateInvestmentInput,
  ProfitDistributionDto,
  DeclareDistributionInput,
  MarkDistributionPaidInput,
  RevenueBreakdown,
  UnreconciledItem,
  MonthlyTargetDto,
  SetMonthlyTargetInput,
  DashboardOverview,
  DashboardAccess,
  OwnershipSummary,
  ProjectDto,
  ProjectEventDto,
  CreateProjectInput,
  UpdateProjectInput,
  AddProjectCheckInput,
  AnswerProjectCheckInput,
  CompanyDocumentDto,
  CreateCompanyDocumentInput,
  DocumentsResult,
  DocumentUploadUrlResult,
  QuoteRates,
  QuoteRatesDto,
  QuoteSurveyInput,
  ClientQuotationDto,
  QuoteBuilderOptions,
  QuoteCostingInput,
  QuoteBuilderAssetDto,
  CreateBuilderQuoteInput,
  WebsiteJobsResult,
  WebsiteJobPhotoUploadUrlResult,
  SaveWebsiteJobInput,
  WebsiteJobMutationResult,
  ProjectMoneyTable,
  ProjectMoneyDetail,
  UnsortedJobDto,
} from '@onyxhawk/types';

import { loadSession, saveSession, clearSession } from './session';
import { createSessionRenewal } from './session-refresh';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, public payload: unknown) {
    super(`API ${status}`);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth, headers, ...rest } = init;
  const session = loadSession();

  // Claim a JSON body only when there is one: Fastify rejects an empty body
  // sent as application/json (FST_ERR_CTP_EMPTY_JSON_BODY), e.g. on DELETE.
  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(rest.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...(headers as Record<string, string> | undefined),
  };
  if (auth && session) finalHeaders.Authorization = `Bearer ${session.accessToken}`;

  let res = await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });

  if (res.status === 401 && auth) {
    const renewed = await sessionRenewal.renew(session?.accessToken ?? null);
    if (renewed) {
      finalHeaders.Authorization = `Bearer ${renewed.accessToken}`;
      res = await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });
    }
  }

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = await res.text().catch(() => null);
    }
    throw new ApiError(res.status, payload);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// One renewal per expiry, shared by every request waiting on it.
const sessionRenewal = createSessionRenewal({
  refreshUrl: `${API_URL}/auth/refresh`,
  // Called through an arrow: the browser's fetch refuses to run detached from window.
  fetch: (url, init) => fetch(url, init),
  load: loadSession,
  save: saveSession,
  clear: clearSession,
});

/** Tells `listener` when a renewal was refused and the stored session cleared. */
export const onSessionRenewalFailed = sessionRenewal.onFailed;

export const api = {
  /** Staff sign-in: staff enter their email and the code is sent there. */
  adminRequestOtp: (email: string) =>
    request<AdminRequestOtpResult>('/auth/admin/request-otp', { method: 'POST', body: JSON.stringify({ email }) }),

  adminVerifyOtp: (email: string, code: string) =>
    request<{ kind: 'AUTHENTICATED'; session: Session }>('/auth/admin/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),

  logout: (refreshToken: string) =>
    request<{ ok: true }>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),

  /** Public service catalog — used to classify a job by its real service line. */
  serviceLines: () =>
    request<{ serviceLines: { id: string; code: string; name: string }[] }>('/catalog/service-lines', {
      method: 'GET',
    }),

  // ── Admin ──────────────────────────────────────────────────────────────
  stats: () => request<{ stats: AdminStats }>('/admin/stats', { method: 'GET', auth: true }),

  bookings: (status?: string) =>
    request<{ bookings: AdminBookingDto[] }>(
      `/admin/bookings${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      { method: 'GET', auth: true },
    ),

  assignCrew: (bookingId: string, input: AssignCrewInput) =>
    request<{ booking: AdminBookingDto }>(`/admin/bookings/${encodeURIComponent(bookingId)}/assign`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  removeCrew: (bookingId: string, userId: string) =>
    request<{ booking: AdminBookingDto }>(
      `/admin/bookings/${encodeURIComponent(bookingId)}/crew/${encodeURIComponent(userId)}`,
      { method: 'DELETE', auth: true },
    ),

  crewUsers: () => request<{ crew: CrewUserDto[] }>('/admin/crew', { method: 'GET', auth: true }),

  quotes: (status?: string) =>
    request<{ quoteRequests: AdminQuoteRequestDto[] }>(
      `/admin/quote-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      { method: 'GET', auth: true },
    ),

  respondQuote: (id: string, input: RespondQuoteInput) =>
    request<{ quoteRequest: AdminQuoteRequestDto }>(`/admin/quote-requests/${encodeURIComponent(id)}/respond`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  // ── Quote builder ────────────────────────────────────────────────────────
  quoteBuilderOptions: () =>
    request<{ options: QuoteBuilderOptions }>('/admin/quote-builder/options', { method: 'GET', auth: true }),

  quoteRates: () => request<QuoteRatesDto>('/admin/quote-builder/rates', { method: 'GET', auth: true }),

  saveQuoteRates: (rates: QuoteRates) =>
    request<QuoteRatesDto>('/admin/quote-builder/rates', { method: 'PUT', auth: true, body: JSON.stringify(rates) }),

  saveQuoteSurvey: (quoteId: string, input: QuoteSurveyInput) =>
    request<{ quoteRequest: AdminQuoteRequestDto }>(`/admin/quote-builder/${encodeURIComponent(quoteId)}/survey`, {
      method: 'PUT',
      auth: true,
      body: JSON.stringify(input),
    }),

  /** Saves the cost questionnaire and the client's price, then re-runs the estimate. */
  saveQuoteCosting: (quoteId: string, input: QuoteCostingInput) =>
    request<{ quoteRequest: AdminQuoteRequestDto }>(`/admin/quote-builder/${encodeURIComponent(quoteId)}/costing`, {
      method: 'PUT',
      auth: true,
      body: JSON.stringify(input),
    }),

  /** Machines in the asset register that are not retired, for the owned-machine picker. */
  quoteBuilderAssets: () =>
    request<{ assets: QuoteBuilderAssetDto[] }>('/admin/quote-builder/assets', { method: 'GET', auth: true }),

  /** Starts a quote for a client who came by phone, referral or tender. */
  createBuilderQuote: (input: CreateBuilderQuoteInput) =>
    request<{ quoteRequest: AdminQuoteRequestDto }>('/admin/quote-builder/quotes', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  recomputeEstimate: (quoteId: string) =>
    request<{ quoteRequest: AdminQuoteRequestDto }>(`/admin/quote-builder/${encodeURIComponent(quoteId)}/estimate`, {
      method: 'POST',
      auth: true,
      body: '{}', // Fastify refuses an empty body once Content-Type is JSON
    }),

  submitEstimate: (quoteId: string) =>
    request<{ quoteRequest: AdminQuoteRequestDto }>(`/admin/quote-builder/${encodeURIComponent(quoteId)}/submit`, {
      method: 'POST',
      auth: true,
      body: '{}', // Fastify refuses an empty body once Content-Type is JSON
    }),

  withdrawEstimate: (quoteId: string) =>
    request<{ quoteRequest: AdminQuoteRequestDto }>(`/admin/quote-builder/${encodeURIComponent(quoteId)}/withdraw`, {
      method: 'POST',
      auth: true,
      body: '{}', // Fastify refuses an empty body once Content-Type is JSON
    }),

  approveEstimate: (quoteId: string, note?: string) =>
    request<{ quoteRequest: AdminQuoteRequestDto }>(`/admin/quote-builder/${encodeURIComponent(quoteId)}/approve`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ note }),
    }),

  rejectEstimate: (quoteId: string, note: string) =>
    request<{ quoteRequest: AdminQuoteRequestDto }>(`/admin/quote-builder/${encodeURIComponent(quoteId)}/reject`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ note }),
    }),

  clientQuotation: (quoteId: string) =>
    request<{ quotation: ClientQuotationDto }>(
      `/admin/quote-builder/${encodeURIComponent(quoteId)}/client-quotation`,
      { method: 'GET', auth: true },
    ),

  // ── Team / staff (owner only) ────────────────────────────────────────────
  staff: () => request<{ staff: AdminStaffDto[] }>('/admin/staff', { method: 'GET', auth: true }),

  addStaff: (input: CreateStaffInput) =>
    request<{ staff: AdminStaffDto }>('/admin/staff', { method: 'POST', auth: true, body: JSON.stringify(input) }),

  updateStaff: (id: string, input: UpdateStaffInput) =>
    request<{ staff: AdminStaffDto }>(`/admin/staff/${encodeURIComponent(id)}`, { method: 'PATCH', auth: true, body: JSON.stringify(input) }),

  removeStaff: (id: string) =>
    request<{ ok: true }>(`/admin/staff/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),

  // ── Financials (owner only) ──────────────────────────────────────────────
  financialSummary: (from: string, to: string) =>
    request<{ summary: FinancialSummary }>(
      `/admin/financials/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { method: 'GET', auth: true },
    ),

  jobs: (from: string, to: string) =>
    request<{ jobs: JobDto[] }>(
      `/admin/financials/jobs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { method: 'GET', auth: true },
    ),

  createJob: (input: CreateJobInput) =>
    request<{ job: JobDto }>('/admin/financials/jobs', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  updateJob: (id: string, input: UpdateJobInput) =>
    request<{ job: JobDto }>(`/admin/financials/jobs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    }),

  deleteJob: (id: string) =>
    request<{ ok: true }>(`/admin/financials/jobs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      auth: true,
    }),

  /** Puts several jobs in one place at once. All are placed, or none. */
  placeJobs: (input: PlaceJobsInput) =>
    request<{ placed: number }>('/admin/financials/jobs/place', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  unsortedJobs: () =>
    request<{ jobs: UnsortedJobDto[] }>('/admin/financials/unsorted', { method: 'GET', auth: true }),

  addJobExpense: (jobId: string, input: CreateExpenseInput) =>
    request<{ expense: ExpenseDto }>(
      `/admin/financials/jobs/${encodeURIComponent(jobId)}/expenses`,
      { method: 'POST', auth: true, body: JSON.stringify(input) },
    ),

  deleteJobExpense: (jobId: string, expenseId: string) =>
    request<{ ok: true }>(
      `/admin/financials/jobs/${encodeURIComponent(jobId)}/expenses/${encodeURIComponent(expenseId)}`,
      { method: 'DELETE', auth: true },
    ),

  // ── Monthly trends (owner only) ──────────────────────────────────────────
  financialTrends: (months = 6) =>
    request<{ trends: MonthlyTrendItem[] }>(
      `/admin/financials/trends?months=${months}`,
      { method: 'GET', auth: true },
    ),

  // ── All-time totals (owner only) ─────────────────────────────────────────
  financialTotals: () =>
    request<{ totals: AllTimeTotals }>('/admin/financials/totals', { method: 'GET', auth: true }),

  // ── Ownership / cap table (owner only) ───────────────────────────────────
  equity: (from: string, to: string) =>
    request<{ overview: EquityOverview }>(
      `/admin/financials/equity?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { method: 'GET', auth: true },
    ),

  /** Each month's net profit split at today's stakes, oldest first, ending at the current month. */
  equityHistory: (months = 12) =>
    request<{ history: EquityHistory }>(
      `/admin/financials/equity/history?months=${months}`,
      { method: 'GET', auth: true },
    ),

  shareholders: () =>
    request<{ shareholders: ShareholderDto[]; totalBasisPoints: number }>(
      '/admin/financials/shareholders',
      { method: 'GET', auth: true },
    ),

  /** Every stake at once: the only request that adds a holder, removes one or changes a stake. */
  replaceStakes: (input: ReplaceStakesInput) =>
    request<ReplaceStakesResult>('/admin/financials/shareholders/stakes', {
      method: 'PUT',
      auth: true,
      body: JSON.stringify(input),
    }),

  /** A holder's details. The server refuses a stake sent here. */
  updateShareholder: (id: string, input: UpdateShareholderInput) =>
    request<{ shareholder: ShareholderDto }>(`/admin/financials/shareholders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    }),

  // ── Finance: marketing, assets, investments, distributions ───────────────
  marketingSpends: (from: string, to: string) =>
    request<{ spends: MarketingSpendDto[] }>(
      `/admin/finance/marketing?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { method: 'GET', auth: true },
    ),

  addMarketingSpend: (input: CreateMarketingSpendInput) =>
    request<{ spend: MarketingSpendDto }>('/admin/finance/marketing', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  deleteMarketingSpend: (id: string) =>
    request<{ ok: true }>(`/admin/finance/marketing/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),

  assets: () => request<{ assets: AssetDto[] }>('/admin/finance/assets', { method: 'GET', auth: true }),

  addAsset: (input: CreateAssetInput) =>
    request<{ asset: AssetDto }>('/admin/finance/assets', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  updateAsset: (id: string, input: Partial<CreateAssetInput>) =>
    request<{ asset: AssetDto }>(`/admin/finance/assets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    }),

  deleteAsset: (id: string) =>
    request<{ ok: true }>(`/admin/finance/assets/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),

  addAssetMaintenance: (assetId: string, input: CreateAssetMaintenanceInput) =>
    request<{ asset: AssetDto }>(`/admin/finance/assets/${encodeURIComponent(assetId)}/maintenance`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  investments: () =>
    request<{ investments: InvestmentDto[] }>('/admin/finance/investments', { method: 'GET', auth: true }),

  addInvestment: (input: CreateInvestmentInput) =>
    request<{ investment: InvestmentDto }>('/admin/finance/investments', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  deleteInvestment: (id: string) =>
    request<{ ok: true }>(`/admin/finance/investments/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),

  revenueBreakdown: (from: string, to: string) =>
    request<{ breakdown: RevenueBreakdown }>(
      `/admin/finance/revenue-breakdown?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { method: 'GET', auth: true },
    ),

  unreconciled: (from: string, to: string) =>
    request<{ items: UnreconciledItem[] }>(
      `/admin/finance/unreconciled?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { method: 'GET', auth: true },
    ),

  reconcile: (
    kind: 'EXPENSE' | 'MARKETING',
    id: string,
    input: { reconciled?: boolean; receiptRef?: string | null; receiptUrl?: string | null },
  ) =>
    request<{ ok: true }>(`/admin/finance/reconcile/${kind}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    }),

  // ── Targets & dashboard overview ─────────────────────────────────────────
  targets: () =>
    request<{ targets: MonthlyTargetDto[] }>('/admin/finance/targets', { method: 'GET', auth: true }),

  setTarget: (input: SetMonthlyTargetInput) =>
    request<{ target: MonthlyTargetDto }>('/admin/finance/targets', {
      method: 'PUT',
      auth: true,
      body: JSON.stringify(input),
    }),

  overview: (year: number, month: number) =>
    request<{ overview: DashboardOverview }>(`/admin/finance/overview?year=${year}&month=${month}`, {
      method: 'GET',
      auth: true,
    }),

  /** Which Dashboard sections this account has, and what it may do there. Asked before any section's data. */
  dashboardAccess: () =>
    request<{ access: DashboardAccess }>('/admin/dashboard/access', { method: 'GET', auth: true }),

  /** One calendar month's net profit split between the current holders, with each holder's all-time share. */
  ownershipSummary: (year: number, month: number) =>
    request<{ summary: OwnershipSummary }>(`/admin/financials/ownership-summary?year=${year}&month=${month}`, {
      method: 'GET',
      auth: true,
    }),

  distributions: () =>
    request<{ distributions: ProfitDistributionDto[] }>('/admin/finance/distributions', {
      method: 'GET',
      auth: true,
    }),

  declareDistribution: (input: DeclareDistributionInput) =>
    request<{ distributions: ProfitDistributionDto[] }>('/admin/finance/distributions/declare', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  updateDistribution: (id: string, input: MarkDistributionPaidInput) =>
    request<{ distribution: ProfitDistributionDto }>(
      `/admin/finance/distributions/${encodeURIComponent(id)}`,
      { method: 'PATCH', auth: true, body: JSON.stringify(input) },
    ),

  deleteDistribution: (id: string) =>
    request<{ ok: true }>(`/admin/finance/distributions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      auth: true,
    }),

  // ── Projects (all staff) ─────────────────────────────────────────────────
  projects: () => request<{ projects: ProjectDto[] }>('/admin/projects', { method: 'GET', auth: true }),

  createProject: (input: CreateProjectInput) =>
    request<{ project: ProjectDto }>('/admin/projects', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  updateProject: (id: string, input: UpdateProjectInput) =>
    request<{ project: ProjectDto }>(`/admin/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    }),

  deleteProject: (id: string) =>
    request<{ ok: true }>(`/admin/projects/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),

  addProjectCheck: (projectId: string, input: AddProjectCheckInput) =>
    request<{ project: ProjectDto }>(`/admin/projects/${encodeURIComponent(projectId)}/checks`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  answerProjectCheck: (projectId: string, checkId: string, input: AnswerProjectCheckInput) =>
    request<{ project: ProjectDto }>(
      `/admin/projects/${encodeURIComponent(projectId)}/checks/${encodeURIComponent(checkId)}`,
      { method: 'PATCH', auth: true, body: JSON.stringify(input) },
    ),

  deleteProjectCheck: (projectId: string, checkId: string) =>
    request<{ project: ProjectDto }>(
      `/admin/projects/${encodeURIComponent(projectId)}/checks/${encodeURIComponent(checkId)}`,
      { method: 'DELETE', auth: true },
    ),

  projectEvents: (projectId: string) =>
    request<{ events: ProjectEventDto[] }>(`/admin/projects/${encodeURIComponent(projectId)}/events`, {
      auth: true,
    }),

  // ── Project money (owner, admin, financial manager, COO) ─────────────────
  projectMoneyTable: () =>
    request<{ table: ProjectMoneyTable }>('/admin/project-money', { method: 'GET', auth: true }),

  projectMoneyDetail: (projectId: string) =>
    request<{ detail: ProjectMoneyDetail }>(
      `/admin/project-money/projects/${encodeURIComponent(projectId)}`,
      { method: 'GET', auth: true },
    ),

  // ── Company documents (shareholders only) ────────────────────────────────
  documents: () => request<DocumentsResult>('/admin/documents', { method: 'GET', auth: true }),

  documentUploadUrl: (fileName: string, contentType: string) =>
    request<DocumentUploadUrlResult>('/admin/documents/upload-url', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ fileName, contentType }),
    }),

  addDocument: (input: CreateCompanyDocumentInput) =>
    request<{ document: CompanyDocumentDto }>('/admin/documents', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  deleteDocument: (id: string) =>
    request<{ ok: true }>(`/admin/documents/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),

  // ── Website jobs (owner, admin and marketing) ────────────────────────────
  websiteJobs: () => request<WebsiteJobsResult>('/admin/website-jobs', { method: 'GET', auth: true }),

  /** Photos are always re-encoded to JPEG first, so that is the only type asked for. */
  websiteJobPhotoUploadUrl: () =>
    request<WebsiteJobPhotoUploadUrlResult>('/admin/website-jobs/upload-url', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ contentType: 'image/jpeg' }),
    }),

  createWebsiteJob: (input: SaveWebsiteJobInput) =>
    request<WebsiteJobMutationResult>('/admin/website-jobs', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  updateWebsiteJob: (id: string, input: SaveWebsiteJobInput) =>
    request<WebsiteJobMutationResult>(`/admin/website-jobs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      auth: true,
      body: JSON.stringify(input),
    }),

  // request() always sends a JSON content type, and the API refuses an empty
  // body under that header, so these send an empty object.
  publishWebsiteJob: (id: string) =>
    request<WebsiteJobMutationResult>(`/admin/website-jobs/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
      auth: true,
      body: '{}',
    }),

  unpublishWebsiteJob: (id: string) =>
    request<WebsiteJobMutationResult>(`/admin/website-jobs/${encodeURIComponent(id)}/unpublish`, {
      method: 'POST',
      auth: true,
      body: '{}',
    }),

  // ── Pending report submissions (owner only) ──────────────────────────────
  pendingReports: () =>
    request<{ reports: JobDto[] }>('/admin/financials/reports', { method: 'GET', auth: true }),

  approveReport: (id: string, input: ApproveReportInput) =>
    request<{ job: JobDto }>(`/admin/financials/reports/${encodeURIComponent(id)}/approve`, {
      method: 'PATCH', auth: true, body: JSON.stringify(input),
    }),

  deleteReport: (id: string) =>
    request<{ ok: true }>(`/admin/financials/reports/${encodeURIComponent(id)}`, {
      method: 'DELETE', auth: true,
    }),

  // ── Job reports (all admin users) ────────────────────────────────────────
  myReports: () =>
    request<{ reports: JobDto[] }>('/admin/job-reports', { method: 'GET', auth: true }),

  submitReport: (input: CreateJobReportInput) =>
    request<{ report: JobDto }>('/admin/job-reports', {
      method: 'POST', auth: true, body: JSON.stringify(input),
    }),

  deleteMyReport: (id: string) =>
    request<{ ok: true }>(`/admin/job-reports/${encodeURIComponent(id)}`, {
      method: 'DELETE', auth: true,
    }),

  addReportExpense: (reportId: string, input: CreateExpenseInput) =>
    request<{ expense: ExpenseDto }>(
      `/admin/job-reports/${encodeURIComponent(reportId)}/expenses`,
      { method: 'POST', auth: true, body: JSON.stringify(input) },
    ),

  deleteReportExpense: (reportId: string, expenseId: string) =>
    request<{ ok: true }>(
      `/admin/job-reports/${encodeURIComponent(reportId)}/expenses/${encodeURIComponent(expenseId)}`,
      { method: 'DELETE', auth: true },
    ),

  // ── Dev sign-in-code viewer (owner only; the server answers 404 outside development) ─────────────────
  recentOtps: () =>
    request<{ codes: { phone: string; email: string | null; purpose: string; codePlain: string; createdAt: string; expiresAt: string }[] }>(
      '/admin/otps/recent',
      { method: 'GET', auth: true },
    ),
};
