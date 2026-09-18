-- Probation tracker: workplans with their status log, the reporting calendar, and the KPI scorecard.
-- Also adds the COO and Business Development Lead roles (IF NOT EXISTS: other branches add them too).

-- CreateEnum
CREATE TYPE "ProbationRole" AS ENUM ('COMMS', 'BD');

-- CreateEnum
CREATE TYPE "WorkplanTaskType" AS ENUM ('STAGE', 'TASK', 'ONGOING', 'DELIVERABLE');

-- CreateEnum
CREATE TYPE "WorkplanStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'HELD');

-- CreateEnum
CREATE TYPE "WorkplanEventKind" AS ENUM ('SEEDED', 'STATUS_CHANGED', 'NOTE_ADDED');

-- CreateEnum
CREATE TYPE "ProbationDecision" AS ENUM ('CONFIRM', 'EXTEND_ONE_MONTH', 'NOT_CONFIRMED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COO';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'BUSINESS_DEVELOPMENT_LEAD';

-- CreateTable
CREATE TABLE "WorkplanTask" (
    "id" TEXT NOT NULL,
    "role" "ProbationRole" NOT NULL,
    "taskNo" TEXT NOT NULL,
    "type" "WorkplanTaskType" NOT NULL,
    "activity" TEXT NOT NULL,
    "category" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "outputRequired" TEXT,
    "status" "WorkplanStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkplanTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkplanEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "WorkplanEventKind" NOT NULL,
    "fromStatus" "WorkplanStatus",
    "toStatus" "WorkplanStatus",
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkplanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportingEvent" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "day" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "who" TEXT NOT NULL,
    "due" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL,
    "submitted" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiDefinition" (
    "id" TEXT NOT NULL,
    "role" "ProbationRole" NOT NULL,
    "kpiName" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "KpiDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiMonthlyTarget" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "KpiMonthlyTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiMonthlyActual" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "actual" DOUBLE PRECISION NOT NULL,
    "enteredById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiMonthlyActual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbationOutcome" (
    "id" TEXT NOT NULL,
    "role" "ProbationRole" NOT NULL,
    "criticalBreach" BOOLEAN NOT NULL DEFAULT false,
    "breachNote" TEXT,
    "finalDecision" "ProbationDecision",
    "finalDecisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProbationOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkplanTask_role_sortOrder_idx" ON "WorkplanTask"("role", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "WorkplanTask_role_taskNo_key" ON "WorkplanTask"("role", "taskNo");

-- CreateIndex
CREATE INDEX "WorkplanEvent_taskId_createdAt_idx" ON "WorkplanEvent"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportingEvent_date_idx" ON "ReportingEvent"("date");

-- CreateIndex
CREATE UNIQUE INDEX "KpiDefinition_role_kpiName_key" ON "KpiDefinition"("role", "kpiName");

-- CreateIndex
CREATE UNIQUE INDEX "KpiMonthlyTarget_kpiId_month_key" ON "KpiMonthlyTarget"("kpiId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "KpiMonthlyActual_kpiId_month_key" ON "KpiMonthlyActual"("kpiId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ProbationOutcome_role_key" ON "ProbationOutcome"("role");

-- AddForeignKey
ALTER TABLE "WorkplanEvent" ADD CONSTRAINT "WorkplanEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkplanTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkplanEvent" ADD CONSTRAINT "WorkplanEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingEvent" ADD CONSTRAINT "ReportingEvent_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingEvent" ADD CONSTRAINT "ReportingEvent_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiMonthlyTarget" ADD CONSTRAINT "KpiMonthlyTarget_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KpiDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiMonthlyActual" ADD CONSTRAINT "KpiMonthlyActual_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KpiDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiMonthlyActual" ADD CONSTRAINT "KpiMonthlyActual_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbationOutcome" ADD CONSTRAINT "ProbationOutcome_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

