import { apiJson, notFoundResponse, withApi } from "@/lib/api/context";
import { lowStockReport, overdueLoansReport, valuationReport } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/v1/reports/valuation | low-stock | overdue (read:reports). Money in minor units of the space currency. */
export async function GET(request: Request, context: { params: Promise<{ report: string }> }) {
  const { report } = await context.params;
  return withApi(request, "read", "read:reports", async ({ spaceId }) => {
    if (report === "valuation") {
      const valuation = await valuationReport(spaceId);
      return apiJson({
        data: {
          currency: valuation.currency,
          totalMinor: valuation.totalMinor,
          inTransitMinor: valuation.inTransitMinor,
          byCategory: valuation.byCategory,
          byLocation: valuation.byLocation,
          items: valuation.items,
        },
      });
    }
    if (report === "low-stock") {
      const rows = await lowStockReport(spaceId);
      return apiJson({ data: rows.map((row) => ({ itemId: row.itemId, sku: row.sku, name: row.name, available: row.available, reorderPoint: row.reorderPoint, reorderQuantity: row.reorderQuantity, onOrder: row.onOrder, supplier: row.supplier })) });
    }
    if (report === "overdue") {
      const rows = await overdueLoansReport(spaceId);
      return apiJson({
        data: rows.map((row) => ({ loanId: row.loanId, reference: row.reference, dueAt: row.dueAt.toISOString(), daysOverdue: row.daysOverdue, units: row.units, borrower: { name: row.borrowerName } })),
      });
    }
    return notFoundResponse("report");
  });
}
