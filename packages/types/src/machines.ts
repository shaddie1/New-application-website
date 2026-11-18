/**
 * The machine register: each machine's price, daily rate and pot, who paid
 * for it and what they are owed. Served to the owner, the admin, the financial
 * manager, the COO and current shareholders; only the owner changes anything.
 * Money is in cents (KSh x 100). Dates are calendar days, YYYY-MM-DD.
 *
 * A machine is a record in the asset list that has a daily rate, so a
 * machine's id is its asset's id.
 */
import type { AssetCategory, AssetCondition } from './admin.js';

/** What the signed-in account may do on the Machines page. Answered for any back-office account. */
export interface MachinesAccessDto {
  canView: boolean;
  /** The owner only. */
  canEdit: boolean;
}

/** A machine's pot. Nothing here is stored: it is worked out from the machine's lines, repairs and payments. */
export interface MachinePotDto {
  /** Every amount logged for the machine, on jobs and on hires. */
  earnedCents: number;
  /** Repairs dated on or after the start day. Earlier repairs are in no figure here. */
  repairsCents: number;
  /** Every payment to an investor. */
  paidOutCents: number;
  /** Earned less repairs less payments. Below zero when repairs have outrun earnings. */
  potCents: number;
  /**
   * Price plus repairs, less earned. Above zero is what the machine has still
   * to earn back; below zero is how far ahead it is.
   */
  earnBackGapCents: number;
  paidForItself: boolean;
  /** The part of the price no investor covered, over the price, in hundredths of a percent (4000 is 40%). 10000 with no investors. */
  companyShareBps: number;
  /** Earned less repairs, less every investor's entitlement. It stays in the pot. */
  companyPartCents: number;
}

/** Someone who paid for all or part of a machine, with what the pot holds for them. */
export interface MachineInvestorDto {
  id: string;
  name: string;
  /** What they put in. */
  contributionCents: number;
  /** What they put in over the price, in hundredths of a percent (6000 is 60%), rounded down. For showing only. */
  shareBps: number;
  /** Their share of earned less repairs, rounded down to the cent. Below zero when repairs have outrun earnings. */
  entitledCents: number;
  paidCents: number;
  /** What can still be paid to them. Never below zero. */
  owedCents: number;
  /** Above zero when they were paid more than they are entitled to. No new payment is accepted until it is zero again. */
  overpaidCents: number;
}

/** One machine on the register. */
export interface MachineRowDto extends MachinePotDto {
  id: string;
  name: string;
  category: AssetCategory;
  /** What the machine cost: the asset's cost. 0 when it has none. */
  priceCents: number;
  /** The rate for days on the company's own jobs. */
  projectRateCents: number;
  /** The rate for a hire to an outside customer. The project rate when none is stored. */
  hireRateCents: number;
  /** False until the owner saves the machine's rates: every machine that had one rate before the hire rate came in. */
  hireRateReviewed: boolean;
  /**
   * The project rate under its old name. Kept for one release for older
   * back-office pages still open; read `projectRateCents` instead.
   */
  dailyRateCents: number;
  /** What the machine earned, split into days on jobs and hires. The two amounts add up to `earnedCents`. */
  earnedSplit: MachineEarnedSplitDto;
  /** The day the pot starts counting. Jobs and repairs dated before it are left out. */
  startDay: string;
  condition: AssetCondition;
  /** ISO time the machine was retired, or null. A retired machine keeps its history and takes no new days or hires. */
  retiredAt: string | null;
  /** Empty when the machine is the company's alone. */
  investors: MachineInvestorDto[];
}

/** A machine's earnings by kind of record. Days are counted in halves: 5 is two and a half days. */
export interface MachineEarnedSplitDto {
  /** Days on the company's own jobs. */
  projectHalfDays: number;
  projectCents: number;
  /** Days hired out to outside customers. */
  hireHalfDays: number;
  hireCents: number;
}

/** The Machines page: every machine on the register, retired ones included. */
export interface MachineRegisterDto {
  machines: MachineRowDto[];
  totals: {
    priceCents: number;
    earnedCents: number;
    repairsCents: number;
    paidOutCents: number;
    potCents: number;
  };
}

/** The days a machine worked on one job, or one hire to an outside customer. */
export interface MachineLineDto {
  id: string;
  jobId: string;
  /** The job's date: a line has no date of its own. For a hire, its start date. */
  date: string; // YYYY-MM-DD
  /**
   * The job's title. A hire's job is titled "Hire: <machine>"; anyone but the
   * owner is sent "Hire" instead, on the hire and on any other machine's days
   * on that job. The customer is never in a title: see `customerName`.
   */
  jobTitle: string;
  /** Days are counted in halves: 5 is two and a half days. */
  halfDays: number;
  /** The daily rate when the line was logged. A later change of rate does not touch it. */
  rateCents: number;
  /**
   * The machine's own rate when the line was made: the line was given a
   * different rate when this differs from `rateCents`. Null on lines made
   * before a line could have its own rate.
   */
  standardRateCents: number | null;
  /** Half days x rate / 2: a cost of the job, and what the machine earned. */
  amountCents: number;
  isHire: boolean;
  /** For a hire, what the customer was charged: the hire job's income. Null for days on a job. */
  chargedCents: number | null;
  /** For a hire, the day it was paid, YYYY-MM-DD. Null while it awaits payment, and for days on a job. */
  paidOn: string | null;
  /** For a hire, its last day, YYYY-MM-DD: a half day takes its whole date. Null for days on a job. */
  endDate: string | null;
  /** For a hire, and sent to the owner only. */
  customerName?: string;
  /** For a hire, and sent to the owner only: the customer's phone number. */
  customerPhone?: string | null;
  /** For a hire, and sent to the owner only. */
  notes?: string | null;
  /** For a hire, and sent to the owner only: the reference of its payment. */
  paymentRef?: string | null;
  /**
   * For a hire, and sent to the owner only: the other machines with days on
   * the hire's job. Left out when there are none.
   */
  otherMachines?: HireOtherMachineDto[];
}

/**
 * Another machine's days on a hire's job. Removing the hire deletes its job,
 * and these days go with it.
 */
export interface HireOtherMachineDto {
  machineName: string;
  /** Days are counted in halves: 5 is two and a half days. */
  halfDays: number;
  /** What leaves that machine's pot when the hire is removed. */
  amountCents: number;
}

/** A repair that comes out of the pot. The same record as the asset's maintenance entry. */
export interface MachineRepairDto {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  costCents: number;
  performedBy: string | null;
  receiptRef: string | null;
}

/** A payment to an investor from the machine's pot. */
export interface MachinePaymentDto {
  id: string;
  investorId: string;
  date: string; // YYYY-MM-DD
  amountCents: number;
  /** M-Pesa code or bank transfer reference. */
  reference: string | null;
}

/** One machine opened on the Machines page. */
export interface MachineDetailDto extends MachineRowDto {
  /** Newest first. */
  lines: MachineLineDto[];
  /** Repairs from the start day on, newest first. */
  repairs: MachineRepairDto[];
  /** Newest first. */
  payments: MachinePaymentDto[];
}

/** A job the owner can log machine days on. */
export interface MachineJobOptionDto {
  jobId: string;
  date: string; // YYYY-MM-DD
  title: string;
  /** Null for a one-off job or one not yet sorted. */
  projectTitle: string | null;
}

/** A period whose payout is already declared. Days logged inside it lower a profit that was already shared out. */
export interface DeclaredPeriodDto {
  label: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
}

/** The owner's job picker for one machine: counted jobs dated on or after its start day, newest first. */
export interface MachineJobPickerDto {
  jobs: MachineJobOptionDto[];
  declaredPeriods: DeclaredPeriodDto[];
}

/**
 * Add a machine. It appears in the asset list with category Machine. A machine
 * added with its two rates has its hire rate reviewed from the start. A request
 * that still carries the old `dailyRateCents` is refused: the page is out of date.
 */
export interface AddMachineInput {
  name: string;
  purchaseDate: string;
  priceCents: number;
  /** For days on the company's own jobs. Whole shillings: a multiple of 100 cents, above zero. */
  projectRateCents: number;
  /** For a hire to an outside customer. Whole shillings: a multiple of 100 cents, above zero. */
  hireRateCents: number;
  /** Today when left out. The owner may send an earlier day. */
  startDay?: string;
}

/** Put an asset already in the asset list on the register, with both rates. Refused, as adding is, when it carries `dailyRateCents`. */
export interface GiveMachineRateInput {
  /** Whole shillings: a multiple of 100 cents, above zero. */
  projectRateCents: number;
  /** Whole shillings: a multiple of 100 cents, above zero. */
  hireRateCents: number;
  /** Today when left out. The owner may send an earlier day. */
  startDay?: string;
}

/**
 * Change a machine. Only the fields sent are changed. Either rate can be
 * changed but not removed, and lines already logged keep the rate they were
 * logged at. Price and start day are refused once an investor has been paid.
 * Refused, as adding is, when it carries `dailyRateCents`.
 */
export interface EditMachineInput {
  name?: string;
  priceCents?: number;
  projectRateCents?: number;
  hireRateCents?: number;
  /** The owner has seen both rates and saved them: clears "hire rate not reviewed". Left out, the mark stays as it is. */
  ratesReviewed?: true;
  /** `RETIRED` retires the machine; any other condition brings it back. */
  condition?: AssetCondition;
  startDay?: string;
}

/** A machine's investors, sent as the whole list: it replaces the list stored. Empty makes the machine the company's. */
export interface ReplaceMachineInvestorsInput {
  /** Together never more than the price. */
  investors: { name: string; contributionCents: number }[];
}

export interface AddMachineRepairInput {
  /** On or after the machine's start day. */
  date: string;
  description: string;
  costCents: number;
  performedBy?: string;
  receiptRef?: string;
}

/** Log the days a machine worked on a job. One line per machine per job. */
export interface LogMachineDaysInput {
  jobId: string;
  /** Above zero. 5 is two and a half days. */
  halfDays: number;
}

/** Correct the days on a line. The line keeps the rate it was logged at. */
export interface EditMachineDaysInput {
  halfDays: number;
}

/** Log a hire to an outside customer. It becomes a one-off job with the amount charged as its income. */
export interface LogMachineHireInput {
  customerName: string;
  startDate: string;
  halfDays: number;
  /** May be less than days x rate: the machine still gets its full rate and the hire job shows the loss. */
  chargedCents: number;
}

/** Correct a hire. The job and its line are written together; the line keeps the rate it was logged at. */
export type EditMachineHireInput = LogMachineHireInput;

/** Record a payment to an investor. Never more than they are still owed. */
export interface PayMachineInvestorInput {
  investorId: string;
  date: string;
  amountCents: number;
  reference?: string;
}
