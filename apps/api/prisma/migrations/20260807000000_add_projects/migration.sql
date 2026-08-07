-- Projects: a client engagement tracked through stages, with a question
-- checklist. Distinct from Job, which is the money record for one completed
-- piece of work.

CREATE TYPE "ProjectStage" AS ENUM (
    'ENQUIRY', 'SURVEY', 'SCHEDULED', 'IN_PROGRESS', 'SNAGGING', 'COMPLETE', 'CANCELLED'
);

CREATE TABLE "Project" (
    "id"              TEXT           NOT NULL,
    "title"           TEXT           NOT NULL,
    "clientName"      TEXT,
    "clientPhone"     TEXT,
    "siteLocation"    TEXT,
    "serviceLineCode" TEXT,
    "clientSegment"   "ClientSegment",
    "stage"           "ProjectStage" NOT NULL DEFAULT 'ENQUIRY',
    "startDate"       DATE,
    "targetEndDate"   DATE,
    "completedAt"     TIMESTAMP(3),
    "valueCents"      INTEGER,
    "notes"           TEXT,
    "createdById"     TEXT           NOT NULL,
    "createdAt"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)   NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Project_stage_idx"     ON "Project"("stage");
CREATE INDEX "Project_startDate_idx" ON "Project"("startDate");

ALTER TABLE "Project"
    ADD CONSTRAINT "Project_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProjectCheck" (
    "id"            TEXT         NOT NULL,
    "projectId"     TEXT         NOT NULL,
    "question"      TEXT         NOT NULL,
    "section"       TEXT,
    "sortOrder"     INTEGER      NOT NULL DEFAULT 0,
    "answer"        BOOLEAN,
    "notApplicable" BOOLEAN      NOT NULL DEFAULT false,
    "note"          TEXT,
    "answeredById"  TEXT,
    "answeredAt"    TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectCheck_projectId_sortOrder_idx" ON "ProjectCheck"("projectId", "sortOrder");

ALTER TABLE "ProjectCheck"
    ADD CONSTRAINT "ProjectCheck_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectCheck"
    ADD CONSTRAINT "ProjectCheck_answeredById_fkey"
    FOREIGN KEY ("answeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
