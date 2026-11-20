-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('ONCE', 'REPEATING');

-- CreateEnum
CREATE TYPE "RepeatUnit" AS ENUM ('WEEK', 'MONTH');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('DONE', 'SKIPPED');

-- AlterEnum
ALTER TYPE "ProjectEventKind" ADD VALUE 'VISIT_MARKED';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "deepCleanEveryMonths" INTEGER,
ADD COLUMN     "deepCleanPriceCents" INTEGER,
ADD COLUMN     "kind" "ProjectKind" NOT NULL DEFAULT 'ONCE',
ADD COLUMN     "repeatEvery" INTEGER,
ADD COLUMN     "repeatUnit" "RepeatUnit",
ADD COLUMN     "serviceDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "weekOfMonth" INTEGER;

-- CreateTable
CREATE TABLE "ProjectVisit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "VisitStatus" NOT NULL,
    "isDeepClean" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "markedById" TEXT,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderRun" (
    "day" DATE NOT NULL,
    "visitCount" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderRun_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE INDEX "ProjectVisit_date_idx" ON "ProjectVisit"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectVisit_projectId_date_key" ON "ProjectVisit"("projectId", "date");

-- AddForeignKey
ALTER TABLE "ProjectVisit" ADD CONSTRAINT "ProjectVisit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVisit" ADD CONSTRAINT "ProjectVisit_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

