-- Owner decisions 2026-10-24: there is no admin or owner role. The inventory
-- manager (MANAGER) is the top role and has every capability both had.
-- Existing owners, admins and their pending invitations become inventory
-- managers, then the enum is recreated without them (Postgres cannot drop an
-- enum value).
UPDATE "Membership" SET "role" = 'MANAGER' WHERE "role" IN ('OWNER', 'ADMIN');
UPDATE "Invitation" SET "role" = 'MANAGER' WHERE "role" IN ('OWNER', 'ADMIN');

ALTER TYPE "SpaceRole" RENAME TO "SpaceRole_old";
CREATE TYPE "SpaceRole" AS ENUM ('MANAGER', 'STAFF', 'MEMBER');

ALTER TABLE "Membership" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "Membership" ALTER COLUMN "role" TYPE "SpaceRole" USING ("role"::text::"SpaceRole");
ALTER TABLE "Membership" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

ALTER TABLE "Invitation" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "Invitation" ALTER COLUMN "role" TYPE "SpaceRole" USING ("role"::text::"SpaceRole");
ALTER TABLE "Invitation" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

DROP TYPE "SpaceRole_old";
