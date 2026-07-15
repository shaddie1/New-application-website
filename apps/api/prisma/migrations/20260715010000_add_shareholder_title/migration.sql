-- Give each shareholder a role/title, and fill in the founders' details:
--   Director row  → Shadrack Amihanda, title "Director"
--   Zecharia      → title "COO" (a shareholder who is also the COO)

ALTER TABLE "Shareholder" ADD COLUMN "title" TEXT;

UPDATE "Shareholder"
   SET "name" = 'Shadrack Amihanda', "title" = 'Director'
 WHERE "id" = 'shr_director';

UPDATE "Shareholder"
   SET "title" = 'COO'
 WHERE "id" = 'shr_zecharia';
