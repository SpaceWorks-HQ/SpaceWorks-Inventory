import "server-only";

import { prisma } from "@/lib/db";

/**
 * The ledger check: every money source has exactly one entry and the amounts
 * agree. Shown on the Finance page and run by the integration tests; a
 * problem means a source changed outside its workflow.
 */

type Count = { n: bigint };

export async function ledgerCheck(spaceId: string) {
  const [payments, refunds, payouts, purchases, mismatched] = await Promise.all([
    prisma.$queryRaw<Count[]>`SELECT COUNT(*) AS n FROM "Payment" p WHERE p."spaceId" = ${spaceId} AND p."status" = 'PAID' AND p."amountMinor" > 0
      AND NOT EXISTS (SELECT 1 FROM "FinanceEntry" f WHERE f."sourceType" = 'Payment' AND f."sourceId" = p."id")`,
    prisma.$queryRaw<Count[]>`SELECT COUNT(*) AS n FROM "Refund" r WHERE r."spaceId" = ${spaceId} AND r."status" = 'PROCESSED'
      AND NOT EXISTS (SELECT 1 FROM "FinanceEntry" f WHERE f."sourceType" = 'Refund' AND f."sourceId" = r."id")`,
    prisma.$queryRaw<Count[]>`SELECT COUNT(*) AS n FROM "RepairPayout" o WHERE o."spaceId" = ${spaceId}
      AND NOT EXISTS (SELECT 1 FROM "FinanceEntry" f WHERE f."sourceType" = 'RepairPayout' AND f."sourceId" = o."id")`,
    prisma.$queryRaw<Count[]>`SELECT COUNT(*) AS n FROM "PurchaseItem" pi WHERE pi."spaceId" = ${spaceId} AND pi."paidMinor" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "FinanceEntry" f WHERE f."sourceType" = 'PurchaseItem' AND f."sourceId" = pi."id")`,
    prisma.$queryRaw<Count[]>`SELECT COUNT(*) AS n FROM "FinanceEntry" f
      LEFT JOIN "Payment" p ON f."sourceType" = 'Payment' AND p."id" = f."sourceId"
      LEFT JOIN "Refund" r ON f."sourceType" = 'Refund' AND r."id" = f."sourceId"
      LEFT JOIN "RepairPayout" o ON f."sourceType" = 'RepairPayout' AND o."id" = f."sourceId"
      LEFT JOIN "PurchaseItem" pi ON f."sourceType" = 'PurchaseItem' AND pi."id" = f."sourceId"
      WHERE f."spaceId" = ${spaceId} AND f."amountMinor" <> COALESCE(p."amountMinor", r."amountMinor", o."amountMinor", pi."paidMinor", f."amountMinor")`,
  ]);
  const n = (rows: Count[]) => Number(rows[0]?.n ?? 0);
  const problems = [
    [n(payments), "paid payments without a ledger entry"],
    [n(refunds), "processed refunds without a ledger entry"],
    [n(payouts), "repair payouts without a ledger entry"],
    [n(purchases), "bought purchases without a ledger entry"],
    [n(mismatched), "entries whose amount differs from their source"],
  ].filter(([count]) => (count as number) > 0).map(([count, what]) => `${count} ${what}`);
  return { ok: problems.length === 0, problems };
}
