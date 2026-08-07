-- Append-only activity log per project: who did what, and when.

CREATE TYPE "ProjectEventKind" AS ENUM (
    'CREATED',
    'DETAILS_CHANGED',
    'STAGE_CHANGED',
    'QUESTION_ANSWERED',
    'QUESTION_ADDED',
    'QUESTION_REMOVED',
    'NOTE_CHANGED'
);

CREATE TABLE "ProjectEvent" (
    "id"        TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind"      "ProjectEventKind" NOT NULL,
    "summary"   TEXT NOT NULL,
    "detail"    TEXT,
    "actorId"   TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectEvent_projectId_createdAt_idx" ON "ProjectEvent"("projectId", "createdAt");

ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
