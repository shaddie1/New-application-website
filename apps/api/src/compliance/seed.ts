/**
 * The 56 checklist items from the Compliance sheet, verbatim. Item text is
 * used as-is in tender packs and audits, so nothing here is paraphrased.
 *
 * Seeding is idempotent and never touches status, dateDone or notes on rows
 * that already exist — only rows whose itemNo is missing are created.
 */
import type { CompliancePriority } from '@onyxhawk/types';

import { prisma } from '../db.js';

export interface SeedItem {
  itemNo: number;
  category: string;
  itemAction: string;
  priority: CompliancePriority;
  owner: string;
  targetDate: string; // YYYY-MM-DD
  costKes: number;
  costType: string;
  whyItMatters?: string;
  sourceOrNote?: string;
}

const MUST: CompliancePriority = 'MUST_HAVE';
const IF_ELIGIBLE: CompliancePriority = 'MUST_HAVE_IF_ELIGIBLE';
const IF_GO: CompliancePriority = 'MUST_HAVE_IF_GO';
const BEFORE_HIRING: CompliancePriority = 'MUST_HAVE_BEFORE_HIRING';
const RECOMMENDED: CompliancePriority = 'RECOMMENDED';
const OPTIONAL: CompliancePriority = 'OPTIONAL';

export const COMPLIANCE_SEED: SeedItem[] = [
  // ── Legal ─────────────────────────────────────────────────────────────────
  { itemNo: 1, category: 'Legal', itemAction: 'Confirm company registration status on BRS/eCitizen: certificate, CR12 and annual returns up to date', priority: MUST, owner: 'CEO', targetDate: '2026-10-09', costKes: 0, costType: 'eCitizen invoice',
    whyItMatters: 'Tenders ask for CR12 and incorporation certificate; banks ask too.',
    sourceOrNote: 'Fees per eCitizen invoice. New registration if ever needed: business name ~KES 950; limited company ~KES 10,650 (lawzana.com Aug 2026).' },
  { itemNo: 2, category: 'Legal', itemAction: 'KRA iTax: confirm company obligations and that every return is filed (nil returns if no income)', priority: MUST, owner: 'COO', targetDate: '2026-10-09', costKes: 0, costType: 'Free',
    whyItMatters: 'Late returns block the Tax Compliance Certificate.', sourceOrNote: 'KRA PIN free via iTax.' },
  { itemNo: 3, category: 'Legal', itemAction: 'Tax Compliance Certificate (TCC)', priority: MUST, owner: 'COO', targetDate: '2026-10-16', costKes: 0, costType: 'Free',
    whyItMatters: 'Mandatory for AGPO and almost every tender.', sourceOrNote: 'Issued free on iTax once returns are compliant.' },
  { itemNo: 4, category: 'Legal', itemAction: 'Nairobi Unified Business Permit 2026 for the registered address: confirm it is valid (if missing, pay now)', priority: MUST, owner: 'COO', targetDate: '2026-10-16', costKes: 4200, costType: 'Annual',
    whyItMatters: 'Tenders ask for a current permit; county can close unlicensed businesses.', sourceOrNote: 'Small trader ~KES 4,000 + KES 200 application (lawzana.com). Check 2026 startup fee waiver.' },
  { itemNo: 5, category: 'Legal', itemAction: 'Renew Unified Business Permit for 2027 (valid 1 Jan – 31 Dec; pay by 31 March)', priority: MUST, owner: 'COO', targetDate: '2027-01-29', costKes: 4200, costType: 'Annual',
    whyItMatters: 'Penalties up to about 3% per month after the deadline.', sourceOrNote: 'lawzana.com Aug 2026, indicative. NairobiPay invoice is binding.' },
  { itemNo: 6, category: 'Legal', itemAction: 'Register for Turnover Tax on iTax and file monthly (1.5% of gross receipts)', priority: MUST, owner: 'COO', targetDate: '2026-10-30', costKes: 0, costType: 'Free',
    whyItMatters: 'Turnover above KES 1 million a year is expected in year 1.', sourceOrNote: 'kra.go.ke. Guides disagree on the rate (1%, 1.5%, 3%): confirm with a tax adviser.' },

  // ── Finance ───────────────────────────────────────────────────────────────
  { itemNo: 7, category: 'Finance', itemAction: 'Open company bank account (KCB Entrepreneurs Account: no opening or operating balance, no ledger or maintenance fee)', priority: MUST, owner: 'CEO', targetDate: '2026-10-16', costKes: 0, costType: 'Free',
    whyItMatters: 'Separates company money; needed for M-Pesa settlement, loans and tenders (bank letter).', sourceOrNote: 'ke.kcbgroup.com. Alternative: Co-op MSME Bronze KES 1,000 opening + KES 100/month + KES 1,000 search fee.' },
  { itemNo: 8, category: 'Finance', itemAction: 'Lipa na M-Pesa Till (or Paybill for invoiced clients) in company name, settling to the bank', priority: MUST, owner: 'COO', targetDate: '2026-10-23', costKes: 0, costType: 'Free',
    whyItMatters: 'Clean records; the website promises M-Pesa STK push.', sourceOrNote: 'Registration free. Merchant fee 0.5% above KES 200, max KES 200 per payment (mobilemoney.co.ke 2026). STK push needs a Paybill/Till on Safaricom Daraja – test it works.' },
  { itemNo: 9, category: 'Finance', itemAction: 'Weekly cash book: every shilling in and out recorded; no mixing with personal money', priority: MUST, owner: 'COO', targetDate: '2026-10-05', costKes: 0, costType: 'Free',
    whyItMatters: 'Commission, margins and loans all depend on accurate numbers.' },
  { itemNo: 10, category: 'Finance', itemAction: 'Renegotiate the current office contract using the three Quotation Calculator options', priority: MUST, owner: 'CEO + COO', targetDate: '2026-10-30', costKes: 0, costType: 'Free',
    whyItMatters: 'KES 12,500 is below the market price for this scope (calculator: KES 21,500 for one deep visit).', sourceOrNote: 'Financial Plan: Current_Contract.' },
  { itemNo: 11, category: 'Finance', itemAction: 'Open a separate reserve account (money market fund or savings account) and move the reserve allocation every month', priority: MUST, owner: 'CEO', targetDate: '2027-01-29', costKes: 0, costType: 'Free',
    whyItMatters: 'Reserve money must not be spent on day-to-day costs.', sourceOrNote: 'Financial Plan: allocation policy on Assumptions.' },
  { itemNo: 12, category: 'Finance', itemAction: 'Monthly readiness review: enter actuals, check the three readiness gates and the laundry gates', priority: MUST, owner: 'COO', targetDate: '2026-11-27', costKes: 0, costType: 'Free',
    whyItMatters: 'Decides when compliant pay and the laundry can start.', sourceOrNote: 'Last Friday of every month.' },

  // ── Tenders ───────────────────────────────────────────────────────────────
  { itemNo: 13, category: 'Tenders', itemAction: 'AGPO eligibility check (70% ownership and 100% leadership by youth 18-35, women, or PWD) and apply on agpo.go.ke', priority: IF_ELIGIBLE, owner: 'CEO', targetDate: '2026-10-30', costKes: 0, costType: 'Free',
    whyItMatters: '30% of government procurement is reserved for AGPO firms.', sourceOrNote: 'Free, valid 2 years (leadafrik.com 2026). If founders do not qualify, do not restructure ownership only to qualify without legal advice.' },
  { itemNo: 14, category: 'Tenders', itemAction: 'Register as supplier on the e-GP Kenya system (egpkenya.go.ke)', priority: MUST, owner: 'BD Lead (COO approves)', targetDate: '2026-10-30', costKes: 0, costType: 'Free',
    whyItMatters: 'Government bids are increasingly submitted electronically.', sourceOrNote: 'tenderyetu.com AGPO guide 2026.' },
  { itemNo: 15, category: 'Tenders', itemAction: 'Daily tender search routine: tenders.go.ke, e-GP, institution websites, newspaper tender pages, LinkedIn', priority: MUST, owner: 'BD Lead', targetDate: '2026-10-16', costKes: 0, costType: 'Free',
    whyItMatters: 'Prequalification windows are short; missing them loses a whole 2-year cycle.', sourceOrNote: 'Example: County Government of Kitui supplier registration 2026-2028 closed 17 Sep 2026.' },
  { itemNo: 16, category: 'Tenders', itemAction: 'UNGM basic supplier registration (UN agencies in Nairobi)', priority: RECOMMENDED, owner: 'BD Lead', targetDate: '2026-11-13', costKes: 0, costType: 'Free',
    whyItMatters: 'Access to UN and NGO cleaning tenders in Gigiri.', sourceOrNote: 'Basic registration is free; confirm on ungm.org.' },
  { itemNo: 17, category: 'Tenders', itemAction: 'Tender document pack with expiry dates: incorporation, CR12, KRA PIN, TCC, permit, AGPO, bank letter, profile, references, equipment list, CVs, insurance certificates', priority: MUST, owner: 'BD Lead', targetDate: '2026-10-30', costKes: 0, costType: 'Quote required',
    whyItMatters: 'Most bids fail on missing or expired mandatory documents.', sourceOrNote: 'Certification of copies by an advocate/commissioner for oaths has a fee: get a quote.' },
  { itemNo: 18, category: 'Tenders', itemAction: 'Two reference letters: current office client plus one past client', priority: MUST, owner: 'CEO', targetDate: '2026-10-23', costKes: 0, costType: 'Free',
    whyItMatters: 'Experience is scored in almost every tender.', sourceOrNote: 'Ask the office client this month.' },

  // ── Insurance ─────────────────────────────────────────────────────────────
  { itemNo: 19, category: 'Insurance', itemAction: 'Public liability insurance: 3 broker quotes, then buy', priority: MUST, owner: 'CEO', targetDate: '2026-11-30', costKes: 0, costType: 'Quote required',
    whyItMatters: "Website and profile say 'fully insured'; institutional clients ask for the certificate.", sourceOrNote: 'No public price.' },
  { itemNo: 20, category: 'Insurance', itemAction: 'WIBA (Work Injury Benefits Act) cover for all workers including casual crew', priority: MUST, owner: 'CEO', targetDate: '2026-11-30', costKes: 0, costType: 'Quote required',
    whyItMatters: 'Legal duty for every employer; tenders ask for the certificate.', sourceOrNote: 'Premiums are typically around 1% of annual payroll (imana.co.ke). Get quotes.' },

  // ── Compliance ────────────────────────────────────────────────────────────
  { itemNo: 21, category: 'Compliance', itemAction: "Fumigation: stop advertising 'licensed' fumigation until licensed; subcontract to a PCPB-licensed operator meanwhile", priority: MUST, owner: 'COO', targetDate: '2026-10-09', costKes: 0, costType: 'Free',
    whyItMatters: 'Pest control without a PCPB licence is an offence under the Pest Control Products Act.', sourceOrNote: "Website currently says 'licensed treatment'." },
  { itemNo: 22, category: 'Compliance', itemAction: 'PCPB licence (when fumigation becomes a real service line): application + commercial pest control operator + qualified operator certificate', priority: OPTIONAL, owner: 'COO', targetDate: '2027-06-30', costKes: 5000, costType: 'Annual',
    whyItMatters: 'Opens fumigation as an in-house service.', sourceOrNote: 'PCPB fees: application KES 1,000; commercial pest control operators KES 4,000/year (pcpb.go.ke). Operator training cost: get quote.' },

  // ── People ────────────────────────────────────────────────────────────────
  { itemNo: 23, category: 'People', itemAction: 'Certificates of good conduct for the two trainees (company pays)', priority: MUST, owner: 'COO', targetDate: '2026-11-30', costKes: 2100, costType: 'Per person',
    whyItMatters: 'Website says crews are background-checked; clients let us into homes and offices.', sourceOrNote: 'KES 1,050 each on eCitizen (DCI), valid 1 year (leadafrik.com 2026).' },
  { itemNo: 24, category: 'People', itemAction: 'Good conduct certificates for regular casual crew (crew member pays or company reimburses after 3 jobs)', priority: RECOMMENDED, owner: 'COO', targetDate: '2027-01-29', costKes: 1050, costType: 'Per person',
    whyItMatters: "Proves the 'vetted crew' promise.", sourceOrNote: 'KES 1,050 per person.' },
  { itemNo: 25, category: 'People', itemAction: 'Signed trainee agreements with the JDs attached', priority: MUST, owner: 'CEO', targetDate: '2026-10-02', costKes: 0, costType: 'Free',
    whyItMatters: 'Makes the rewards, pay phases and KPIs binding on both sides.' },
  { itemNo: 26, category: 'People', itemAction: 'Advocate review of the trainee agreement and commission terms', priority: RECOMMENDED, owner: 'CEO', targetDate: '2026-10-02', costKes: 0, costType: 'Quote required',
    whyItMatters: 'Kenyan law looks at the real working relationship, not the label.', sourceOrNote: 'Get a fixed-fee quote.' },
  { itemNo: 27, category: 'People', itemAction: 'Crew register (ID, phone, next of kin, good conduct, training date) and daily pay records', priority: MUST, owner: 'COO', targetDate: '2026-10-16', costKes: 0, costType: 'Free',
    whyItMatters: 'Now phase: crew paid up to KES 800 per job day. Compliant phase: at least KES 868.44 (Nairobi daily minimum from 1 May 2026).', sourceOrNote: 'Regulation of Wages (General) (Amendment) Order 2026.' },
  { itemNo: 28, category: 'People', itemAction: 'Employer registration with NSSF, SHA and KRA PAYE, written employment contracts and WIBA for all staff, before compliant pay starts', priority: BEFORE_HIRING, owner: 'COO', targetDate: '2027-12-01', costKes: 0, costType: 'Free',
    whyItMatters: 'Statutory deductions due by the 9th of the next month.', sourceOrNote: 'Timing follows the readiness gates in the Financial Plan (planned switch January 2028).' },

  // ── Brand ─────────────────────────────────────────────────────────────────
  { itemNo: 29, category: 'Brand', itemAction: 'Claims audit of website and company profile: keep only what we can prove (years, 500+ clients, 2,000+ cleans, 4.9 rating, fully insured, certified crews, licensed fumigation, countrywide, same-day, STK push, Hawk Points, team list)', priority: MUST, owner: 'CEO + Comms', targetDate: '2026-10-09', costKes: 0, costType: 'Free',
    whyItMatters: 'False claims in a tender can mean disqualification; with clients they destroy trust.', sourceOrNote: 'See Strategy Guide section 10.' },
  { itemNo: 30, category: 'Brand', itemAction: 'One official phone number everywhere (profile shows +254 115 247 988; website shows +254 702 416 697)', priority: MUST, owner: 'Comms', targetDate: '2026-10-09', costKes: 0, costType: 'Free',
    whyItMatters: 'Lost leads and confused clients.' },
  { itemNo: 31, category: 'Brand', itemAction: 'Google Business Profile verified with services, photos, hours, WhatsApp link', priority: MUST, owner: 'Comms', targetDate: '2026-10-16', costKes: 0, costType: 'Free',
    whyItMatters: 'Main free source of local household enquiries and reviews.' },
  { itemNo: 32, category: 'Brand', itemAction: 'WhatsApp Business: catalogue, price list, quick replies, labels, greeting and away messages', priority: MUST, owner: 'Comms', targetDate: '2026-10-09', costKes: 0, costType: 'Free',
    whyItMatters: 'Most Nairobi household bookings happen on WhatsApp.' },
  { itemNo: 33, category: 'Brand', itemAction: 'LinkedIn Company Page complete (logo, banner, about, services, website, location)', priority: MUST, owner: 'BD Lead', targetDate: '2026-10-16', costKes: 0, costType: 'Free',
    whyItMatters: 'Procurement officers and office managers check LinkedIn.' },
  { itemNo: 34, category: 'Brand', itemAction: 'Facebook, Instagram and TikTok business accounts connected in Meta Business Suite', priority: MUST, owner: 'Comms', targetDate: '2026-10-09', costKes: 0, costType: 'Free',
    whyItMatters: 'Household marketing channels.' },
  { itemNo: 35, category: 'Brand', itemAction: '2-page capability statement for institutions (content by BD, design by Comms)', priority: MUST, owner: 'BD Lead + Comms', targetDate: '2026-10-30', costKes: 0, costType: 'Free',
    whyItMatters: 'Leave-behind for meetings and attachment to EOIs.' },
  { itemNo: 36, category: 'Brand', itemAction: 'Approved household price list (COO sign-off)', priority: MUST, owner: 'COO + Comms', targetDate: '2026-10-16', costKes: 0, costType: 'Free',
    whyItMatters: 'Lets Comms quote standard jobs fast without waiting for founders.', sourceOrNote: 'Build each line with Quote_Calculator.' },
  { itemNo: 37, category: 'Brand', itemAction: 'Photo consent clause in quotes/bookings and a before/after photo library', priority: MUST, owner: 'Comms', targetDate: '2026-10-16', costKes: 0, costType: 'Free',
    whyItMatters: 'Kenya Data Protection Act 2019: client images are personal data.' },
  { itemNo: 38, category: 'Brand', itemAction: 'Feedback form and Google review request sent after every job', priority: MUST, owner: 'Comms', targetDate: '2026-10-16', costKes: 0, costType: 'Free',
    whyItMatters: 'Reviews are the cheapest marketing we have.', sourceOrNote: 'Never write or buy fake reviews.' },
  { itemNo: 39, category: 'Brand', itemAction: 'Website: record domain and hosting renewal dates; test quote and booking forms monthly', priority: MUST, owner: 'Comms', targetDate: '2026-10-16', costKes: 0, costType: 'Existing',
    whyItMatters: 'A broken form loses leads silently.', sourceOrNote: 'Confirm renewal cost with the current host.' },

  // ── Tools ─────────────────────────────────────────────────────────────────
  { itemNo: 40, category: 'Tools', itemAction: 'Shared Google Drive (folders: Tenders, Clients, Marketing, Reports, Templates, Finance) with this workbook', priority: MUST, owner: 'COO', targetDate: '2026-10-05', costKes: 0, costType: 'Free',
    whyItMatters: 'Founders can review without meetings.' },

  // ── Operations ────────────────────────────────────────────────────────────
  { itemNo: 41, category: 'Operations', itemAction: 'Service SOPs and site checklists; job sheet with client sign-off', priority: MUST, owner: 'COO + BD Lead', targetDate: '2026-11-13', costKes: 0, costType: 'Free',
    whyItMatters: 'Consistent quality; tender method statements reuse them.' },
  { itemNo: 42, category: 'Operations', itemAction: 'Equipment register (machine, serial number, photo, condition, value)', priority: MUST, owner: 'BD Lead', targetDate: '2026-10-23', costKes: 0, costType: 'Free',
    whyItMatters: 'Tenders ask for an equipment list; insurance needs it.' },
  { itemNo: 43, category: 'Operations', itemAction: 'PPE and first aid kit for each crew', priority: MUST, owner: 'COO', targetDate: '2026-11-13', costKes: 0, costType: 'Quote required',
    whyItMatters: 'Worker safety and WIBA claims prevention.' },
  { itemNo: 44, category: 'Operations', itemAction: 'Branded uniforms or reflector vests', priority: RECOMMENDED, owner: 'COO', targetDate: '2027-01-29', costKes: 0, costType: 'Quote required',
    whyItMatters: 'Website says crews are uniformed.' },
  { itemNo: 45, category: 'Operations', itemAction: 'Templates: client service agreement, quotation, invoice, receipt, completion certificate', priority: MUST, owner: 'COO', targetDate: '2026-10-16', costKes: 0, costType: 'Free',
    whyItMatters: 'Completion certificates become tender experience evidence.' },
  { itemNo: 46, category: 'Operations', itemAction: 'Record real crew hours on every job and adjust Quotation Calculator production rates each quarter', priority: RECOMMENDED, owner: 'BD Lead', targetDate: '2026-12-31', costKes: 0, costType: 'Free',
    whyItMatters: 'Keeps quotes accurate as the crew gets faster.' },

  // ── Growth ────────────────────────────────────────────────────────────────
  { itemNo: 47, category: 'Growth', itemAction: 'Hawk Points: write simple rules and run it, or remove it from website and profile', priority: RECOMMENDED, owner: 'Comms', targetDate: '2026-11-13', costKes: 0, costType: 'Free',
    whyItMatters: 'An advertised loyalty scheme that does not work damages trust.' },
  { itemNo: 48, category: 'Growth', itemAction: 'Partner list: property managers, estate agents, short-stay (Airbnb) hosts, co-working spaces, developers, facility-management firms', priority: RECOMMENDED, owner: 'BD Lead + Comms', targetDate: '2026-11-30', costKes: 0, costType: 'Free',
    whyItMatters: 'Partners bring repeat work without tender paperwork.' },
  { itemNo: 49, category: 'Growth', itemAction: 'Paid social ads test', priority: OPTIONAL, owner: 'COO', targetDate: '2027-04-30', costKes: 0, costType: 'Company decision',
    whyItMatters: 'Only after 3 consecutive months of positive monthly result.', sourceOrNote: 'Set a fixed monthly cap before starting.' },

  // ── Laundry ───────────────────────────────────────────────────────────────
  { itemNo: 50, category: 'Laundry', itemAction: 'Go / No-go decision against the laundry gates (Strategy Guide section 11)', priority: MUST, owner: 'CEO + COO', targetDate: '2027-01-15', costKes: 0, costType: 'Free',
    whyItMatters: 'Protects us from taking a loan we cannot repay.' },
  { itemNo: 51, category: 'Laundry', itemAction: 'Financing secured (loan or partner funds) for the setup budget', priority: IF_GO, owner: 'CEO', targetDate: '2027-02-12', costKes: 0, costType: 'In Financial Plan',
    sourceOrNote: 'Amount and repayment on Laundry_Setup.' },
  { itemNo: 52, category: 'Laundry', itemAction: 'Premises lease signed (rent max KES 10,000; deposit; water and power meters checked)', priority: IF_GO, owner: 'COO', targetDate: '2027-02-19', costKes: 0, costType: 'In Financial Plan',
    sourceOrNote: 'On Laundry_Setup.' },
  { itemNo: 53, category: 'Laundry', itemAction: 'Equipment bought: washing machine, steam iron, ironing board, 100 kg scale', priority: IF_GO, owner: 'COO', targetDate: '2027-02-26', costKes: 0, costType: 'In Financial Plan',
    sourceOrNote: 'On Laundry_Setup.' },
  { itemNo: 54, category: 'Laundry', itemAction: 'Unified Business Permit for the laundry premises; fire and health inspection', priority: IF_GO, owner: 'COO', targetDate: '2027-02-26', costKes: 0, costType: 'In Financial Plan',
    whyItMatters: 'Permits are address-specific.', sourceOrNote: 'On Laundry_Setup.' },
  { itemNo: 55, category: 'Laundry', itemAction: 'Laundry price list, intake tags, receipts, lost and damaged item policy', priority: IF_GO, owner: 'Comms', targetDate: '2027-02-26', costKes: 0, costType: 'Free',
    whyItMatters: 'Avoids disputes from day one.' },
  { itemNo: 56, category: 'Laundry', itemAction: 'Attendant on a written casual agreement at KES 9,000 a month (Now phase); moves to a legal-minimum contract when compliant pay starts', priority: IF_GO, owner: 'COO', targetDate: '2027-02-26', costKes: 0, costType: 'In Financial Plan',
    whyItMatters: 'Clear written terms prevent disputes.', sourceOrNote: 'Financial Plan: Assumptions and Laundry.' },
];

/** Create any item whose itemNo is missing. Existing rows are left alone. Returns how many were created. */
export async function seedComplianceItems(): Promise<number> {
  const existing = new Set((await prisma.complianceItem.findMany({ select: { itemNo: true } })).map((r) => r.itemNo));
  const missing = COMPLIANCE_SEED.filter((s) => !existing.has(s.itemNo));
  for (const s of missing) {
    await prisma.complianceItem.create({
      data: {
        itemNo: s.itemNo,
        category: s.category,
        itemAction: s.itemAction,
        priority: s.priority,
        whyItMatters: s.whyItMatters ?? null,
        owner: s.owner,
        targetDate: new Date(s.targetDate),
        costCents: Math.round(s.costKes * 100),
        costType: s.costType,
        sourceOrNote: s.sourceOrNote ?? null,
        events: { create: { kind: 'SEEDED', toStatus: 'NOT_STARTED', summary: 'Seeded from the Compliance sheet' } },
      },
    });
  }
  return missing.length;
}
