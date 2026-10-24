-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "dueReminderAt" TIMESTAMP(3),
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "overdueAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LoanLine" ADD COLUMN     "quantityConsumed" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "LoanLine" DROP CONSTRAINT "LoanLine_quantities_valid";
ALTER TABLE "LoanLine" ADD CONSTRAINT "LoanLine_quantities_valid" CHECK (
  "quantityRequested" > 0 AND "quantityApproved" >= 0 AND "quantityApproved" <= "quantityRequested"
  AND "quantityIssued" >= 0 AND "quantityIssued" <= "quantityApproved"
  AND "quantityReturned" >= 0 AND "quantityDamaged" >= 0 AND "quantityLost" >= 0 AND "quantityConsumed" >= 0
  AND "quantityReturned" + "quantityDamaged" + "quantityLost" + "quantityConsumed" <= "quantityIssued"
);
