-- Website jobs: finished work staff publish to the public site's "Our work"
-- section and portfolio. Client type and area only — no column for a client's
-- name, phone or address. Reuses the existing "ClientSegment" type.

CREATE TABLE "WebsiteJob" (
    "id"              TEXT            NOT NULL,
    "serviceLineCode" TEXT            NOT NULL,
    "clientSegment"   "ClientSegment" NOT NULL,
    "area"            TEXT            NOT NULL,
    "completedOn"     DATE            NOT NULL,
    "description"     TEXT            NOT NULL,
    "publishedAt"     TIMESTAMP(3),
    "createdById"     TEXT            NOT NULL,
    "createdAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)    NOT NULL,
    CONSTRAINT "WebsiteJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebsiteJob_publishedAt_completedOn_idx" ON "WebsiteJob"("publishedAt", "completedOn");

ALTER TABLE "WebsiteJob"
    ADD CONSTRAINT "WebsiteJob_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WebsiteJobPhoto" (
    "id"        TEXT         NOT NULL,
    "jobId"     TEXT         NOT NULL,
    "objectKey" TEXT         NOT NULL,
    "url"       TEXT         NOT NULL,
    "sortOrder" INTEGER      NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebsiteJobPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebsiteJobPhoto_jobId_sortOrder_idx" ON "WebsiteJobPhoto"("jobId", "sortOrder");

ALTER TABLE "WebsiteJobPhoto"
    ADD CONSTRAINT "WebsiteJobPhoto_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "WebsiteJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
