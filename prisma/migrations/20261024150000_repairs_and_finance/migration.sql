-- Owner decisions 2026-10-24: repairs with technicians (staff and external),
-- payouts, and one append-only finance ledger for every money movement.

-- CreateEnum
CREATE TYPE "RepairSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('REPORTED', 'ASSIGNED', 'FIXED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RepairOutcome" AS ENUM ('FIXED', 'SCRAPPED');

-- CreateEnum
CREATE TYPE "TechnicianKind" AS ENUM ('STAFF', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "TechnicianChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "RepairRequestStatus" AS ENUM ('SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'OTHER');

-- CreateEnum
CREATE TYPE "FinanceDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "FinanceMethod" AS ENUM ('GATEWAY_RAZORPAY', 'GATEWAY_STRIPE', 'CASH', 'BANK_TRANSFER', 'UPI', 'OTHER');

-- CreateEnum
CREATE TYPE "FinanceCategory" AS ENUM ('LOAN_FEES', 'DEPOSIT', 'RENTAL', 'LATE_FEE', 'DAMAGE', 'LOSS', 'REFUND', 'DEPOSIT_REFUND', 'REPAIR', 'PURCHASE', 'RENT', 'UTILITIES', 'SUPPLIES', 'OTHER_INCOME', 'OTHER_EXPENSE');

-- AlterEnum
ALTER TYPE "SpaceRole" ADD VALUE 'TECHNICIAN';

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paidMethod" "PayoutMethod",
ADD COLUMN     "paidMinor" INTEGER,
ADD COLUMN     "paidReference" TEXT,
ADD COLUMN     "repairIssueId" TEXT;

-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "repairRequestDays" INTEGER NOT NULL DEFAULT 14;

-- CreateTable
CREATE TABLE "Technician" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "kind" "TechnicianKind" NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "telegramChatId" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredChannel" "TechnicianChannel",
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Technician_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairIssue" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "assetId" TEXT,
    "incidentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "RepairSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "RepairStatus" NOT NULL DEFAULT 'REPORTED',
    "reportedById" TEXT,
    "heldQuantity" INTEGER NOT NULL DEFAULT 0,
    "heldLocationId" TEXT,
    "holdAdopted" BOOLEAN NOT NULL DEFAULT false,
    "assignedTechnicianId" TEXT,
    "fixRemarks" TEXT,
    "partsUsed" TEXT,
    "amountAskedMinor" INTEGER,
    "fixedAt" TIMESTAMP(3),
    "approvedMinor" INTEGER,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNote" TEXT,
    "outcome" "RepairOutcome",
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairRequest" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "status" "RepairRequestStatus" NOT NULL DEFAULT 'SENT',
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "RepairRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairEvent" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorId" TEXT,
    "technicianId" TEXT,
    "channel" TEXT,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairPhoto" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT,
    "technicianId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairPayout" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "method" "PayoutMethod" NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "paidById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "direction" "FinanceDirection" NOT NULL,
    "category" "FinanceCategory" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "method" "FinanceMethod" NOT NULL,
    "reference" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "itemId" TEXT,
    "assetId" TEXT,
    "technicianId" TEXT,
    "supplierId" TEXT,
    "reversesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceChatConfig" (
    "spaceId" TEXT NOT NULL,
    "telegramBotTokenEnc" TEXT,
    "whatsappPhoneNumberId" TEXT,
    "whatsappTokenEnc" TEXT,
    "whatsappTemplate" TEXT NOT NULL DEFAULT 'repair_request',
    "whatsappLanguage" TEXT NOT NULL DEFAULT 'en',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceChatConfig_pkey" PRIMARY KEY ("spaceId")
);

-- CreateIndex
CREATE INDEX "Technician_spaceId_active_idx" ON "Technician"("spaceId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Technician_spaceId_userId_key" ON "Technician"("spaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RepairIssue_incidentId_key" ON "RepairIssue"("incidentId");

-- CreateIndex
CREATE INDEX "RepairIssue_spaceId_status_idx" ON "RepairIssue"("spaceId", "status");

-- CreateIndex
CREATE INDEX "RepairIssue_itemId_idx" ON "RepairIssue"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "RepairIssue_spaceId_number_key" ON "RepairIssue"("spaceId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "RepairRequest_tokenHash_key" ON "RepairRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "RepairRequest_spaceId_status_idx" ON "RepairRequest"("spaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RepairRequest_issueId_technicianId_key" ON "RepairRequest"("issueId", "technicianId");

-- CreateIndex
CREATE INDEX "RepairEvent_issueId_createdAt_idx" ON "RepairEvent"("issueId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RepairPhoto_storageKey_key" ON "RepairPhoto"("storageKey");

-- CreateIndex
CREATE INDEX "RepairPhoto_issueId_idx" ON "RepairPhoto"("issueId");

-- CreateIndex
CREATE INDEX "RepairPayout_spaceId_paidAt_idx" ON "RepairPayout"("spaceId", "paidAt");

-- CreateIndex
CREATE INDEX "RepairPayout_issueId_idx" ON "RepairPayout"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEntry_reversesId_key" ON "FinanceEntry"("reversesId");

-- CreateIndex
CREATE INDEX "FinanceEntry_spaceId_occurredAt_idx" ON "FinanceEntry"("spaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinanceEntry_spaceId_category_idx" ON "FinanceEntry"("spaceId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEntry_sourceType_sourceId_key" ON "FinanceEntry"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_repairIssueId_fkey" FOREIGN KEY ("repairIssueId") REFERENCES "RepairIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Technician" ADD CONSTRAINT "Technician_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Technician" ADD CONSTRAINT "Technician_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairIssue" ADD CONSTRAINT "RepairIssue_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairIssue" ADD CONSTRAINT "RepairIssue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairIssue" ADD CONSTRAINT "RepairIssue_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairIssue" ADD CONSTRAINT "RepairIssue_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "LoanIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairIssue" ADD CONSTRAINT "RepairIssue_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "Technician"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "RepairIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairEvent" ADD CONSTRAINT "RepairEvent_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairEvent" ADD CONSTRAINT "RepairEvent_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "RepairIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPhoto" ADD CONSTRAINT "RepairPhoto_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPhoto" ADD CONSTRAINT "RepairPhoto_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "RepairIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPayout" ADD CONSTRAINT "RepairPayout_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPayout" ADD CONSTRAINT "RepairPayout_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "RepairIssue"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPayout" ADD CONSTRAINT "RepairPayout_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceChatConfig" ADD CONSTRAINT "SpaceChatConfig_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Amounts are whole positive minor units.
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "RepairPayout" ADD CONSTRAINT "RepairPayout_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "RepairIssue" ADD CONSTRAINT "RepairIssue_held_nonnegative" CHECK ("heldQuantity" >= 0);
ALTER TABLE "RepairIssue" ADD CONSTRAINT "RepairIssue_amounts_nonnegative" CHECK (COALESCE("amountAskedMinor", 0) >= 0 AND COALESCE("approvedMinor", 0) >= 0);
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_paid_positive" CHECK ("paidMinor" IS NULL OR "paidMinor" > 0);
ALTER TABLE "Space" ADD CONSTRAINT "Space_repairRequestDays_range" CHECK ("repairRequestDays" BETWEEN 1 AND 90);

-- The finance ledger, repair payouts and the repair timeline are append-only:
-- no update ever, and no delete while their space exists (deleting a space
-- still removes everything in it).
CREATE FUNCTION swi_ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
  END IF;
  IF EXISTS (SELECT 1 FROM "Space" WHERE "id" = OLD."spaceId") THEN
    RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "FinanceEntry_append_only" BEFORE UPDATE OR DELETE ON "FinanceEntry" FOR EACH ROW EXECUTE FUNCTION swi_ledger_guard();
CREATE TRIGGER "RepairPayout_append_only" BEFORE UPDATE OR DELETE ON "RepairPayout" FOR EACH ROW EXECUTE FUNCTION swi_ledger_guard();
CREATE TRIGGER "RepairEvent_append_only" BEFORE UPDATE OR DELETE ON "RepairEvent" FOR EACH ROW EXECUTE FUNCTION swi_ledger_guard();

-- Backfill: money that moved before the ledger existed, posted once per source.
INSERT INTO "FinanceEntry" ("id", "spaceId", "direction", "category", "amountMinor", "currency", "method", "reference", "occurredAt", "sourceType", "sourceId", "actorId", "note")
SELECT
  'fin' || md5('Payment:' || p."id"),
  p."spaceId",
  'IN',
  (CASE WHEN (SELECT COUNT(DISTINCT c."kind") FROM "LoanCharge" c WHERE c."paymentId" = p."id") = 1
    THEN (SELECT MIN(c."kind"::text) FROM "LoanCharge" c WHERE c."paymentId" = p."id")
    ELSE 'LOAN_FEES' END)::"FinanceCategory",
  p."amountMinor",
  p."currency",
  (CASE p."provider"::text
    WHEN 'RAZORPAY' THEN 'GATEWAY_RAZORPAY'
    WHEN 'STRIPE' THEN 'GATEWAY_STRIPE'
    ELSE CASE LOWER(COALESCE(p."method", '')) WHEN 'cash' THEN 'CASH' WHEN 'upi' THEN 'UPI' WHEN 'bank_transfer' THEN 'BANK_TRANSFER' ELSE 'OTHER' END
  END)::"FinanceMethod",
  COALESCE(p."reference", p."gatewayPaymentId"),
  COALESCE(p."paidAt", p."updatedAt"),
  'Payment',
  p."id",
  p."recordedById",
  'Posted when the finance ledger was introduced.'
FROM "Payment" p
WHERE p."status" = 'PAID' AND p."amountMinor" > 0;

INSERT INTO "FinanceEntry" ("id", "spaceId", "direction", "category", "amountMinor", "currency", "method", "reference", "occurredAt", "sourceType", "sourceId", "actorId", "note")
SELECT
  'fin' || md5('Refund:' || r."id"),
  r."spaceId",
  'OUT',
  (CASE WHEN r."reason" LIKE 'Deposit returned%' THEN 'DEPOSIT_REFUND' ELSE 'REFUND' END)::"FinanceCategory",
  r."amountMinor",
  p."currency",
  (CASE p."provider"::text
    WHEN 'RAZORPAY' THEN 'GATEWAY_RAZORPAY'
    WHEN 'STRIPE' THEN 'GATEWAY_STRIPE'
    ELSE CASE LOWER(COALESCE(p."method", '')) WHEN 'cash' THEN 'CASH' WHEN 'upi' THEN 'UPI' WHEN 'bank_transfer' THEN 'BANK_TRANSFER' ELSE 'OTHER' END
  END)::"FinanceMethod",
  r."gatewayRefundId",
  COALESCE(r."processedAt", r."createdAt"),
  'Refund',
  r."id",
  r."createdById",
  'Posted when the finance ledger was introduced.'
FROM "Refund" r JOIN "Payment" p ON p."id" = r."paymentId"
WHERE r."status" = 'PROCESSED';

-- Bought purchases record what they cost (estimated from the unit cost).
UPDATE "PurchaseItem"
SET "paidMinor" = "unitCostMinor" * "quantity", "paidMethod" = 'OTHER', "paidAt" = COALESCE("orderedAt", "receivedAt", "updatedAt")
WHERE "status" IN ('ORDERED', 'RECEIVED') AND COALESCE("unitCostMinor", 0) > 0;

INSERT INTO "FinanceEntry" ("id", "spaceId", "direction", "category", "amountMinor", "currency", "method", "reference", "occurredAt", "sourceType", "sourceId", "actorId", "note", "itemId", "supplierId")
SELECT
  'fin' || md5('PurchaseItem:' || pi."id"),
  pi."spaceId",
  'OUT',
  'PURCHASE',
  pi."paidMinor",
  s."currency",
  'OTHER',
  NULL,
  pi."paidAt",
  'PurchaseItem',
  pi."id",
  pi."approvedById",
  'Posted when the finance ledger was introduced (estimated from the unit cost).',
  pi."itemId",
  pi."supplierId"
FROM "PurchaseItem" pi JOIN "Space" s ON s."id" = pi."spaceId"
WHERE pi."paidMinor" IS NOT NULL;
