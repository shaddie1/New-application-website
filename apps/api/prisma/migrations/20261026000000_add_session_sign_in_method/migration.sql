-- Record how each session began, so /admin can refuse sessions that started
-- with an SMS code. Additive only: a new enum type and a defaulted column.
--
-- Every existing session becomes SMS through the default, because nothing
-- recorded how it began. Staff therefore sign in to the admin portal by email
-- once after this deploy; customer and crew sessions carry on as before.

-- CreateEnum
CREATE TYPE "SignInMethod" AS ENUM ('SMS', 'EMAIL');

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "signInMethod" "SignInMethod" NOT NULL DEFAULT 'SMS';
