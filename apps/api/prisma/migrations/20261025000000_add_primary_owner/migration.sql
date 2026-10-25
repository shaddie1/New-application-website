-- Primary owner and the team role-change audit trail. Additive only: one
-- defaulted column, one new table, new indexes. Nothing existing is altered,
-- so the previous API build runs unchanged against this schema.

-- The one owner who can change other owners. Defaults to false for everyone;
-- scripts/set-primary-owner.ts sets it for exactly one person.
ALTER TABLE "User" ADD COLUMN     "isPrimaryOwner" BOOLEAN NOT NULL DEFAULT false;

-- At most one primary owner. A partial unique index: only rows where the flag
-- is true take part, so any number of rows may be false. Prisma's schema
-- language cannot express this, so it lives only in this migration.
CREATE UNIQUE INDEX "User_one_primary_owner" ON "User"("isPrimaryOwner") WHERE "isPrimaryOwner";

-- CreateTable
CREATE TABLE "StaffRoleChange" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "oldRole" TEXT NOT NULL,
    "newRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRoleChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffRoleChange_targetId_createdAt_idx" ON "StaffRoleChange"("targetId", "createdAt");

-- AddForeignKey
ALTER TABLE "StaffRoleChange" ADD CONSTRAINT "StaffRoleChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRoleChange" ADD CONSTRAINT "StaffRoleChange_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
