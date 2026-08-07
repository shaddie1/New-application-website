-- How a project is billed. With ONE_OFF, Project.valueCents is the whole job;
-- otherwise it is the rate per billing period.

CREATE TYPE "PaymentFrequency" AS ENUM ('ONE_OFF', 'DAILY', 'WEEKLY', 'MONTHLY');

ALTER TABLE "Project"
    ADD COLUMN "paymentFrequency" "PaymentFrequency" NOT NULL DEFAULT 'ONE_OFF';
