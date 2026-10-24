/** Report tabs (pure and client-safe). `ranged` reports use the date range. */
export const REPORTS = [
  { key: "valuation", label: "Valuation", ranged: false, description: "What the stock on the shelves is worth at average cost, plus stock in transit." },
  { key: "low-stock", label: "Low stock", ranged: false, description: "Items at or below their reorder point, with what is already on the buy list." },
  { key: "movements", label: "Stock movements", ranged: true, description: "Receipts, adjustments, write-offs and count corrections in the period." },
  { key: "loans", label: "Loans", ranged: true, description: "What is out now, what is overdue, who borrows most and which items are popular." },
  { key: "incidents", label: "Lost and damaged", ranged: true, description: "Lost or damaged items by item and by member, open and resolved." },
  { key: "transfers", label: "Transfers", ranged: true, description: "Transfers in and out by space, stock on the road and shortfalls on arrival." },
  { key: "payments", label: "Payments", ranged: true, description: "Money collected, pending, refunded and waived." },
  { key: "repairs", label: "Repairs", ranged: true, description: "Repairs reported and closed, and what was paid to technicians by repair, technician, item and month." },
] as const;

export type ReportKey = (typeof REPORTS)[number]["key"];

export function isReportKey(value: unknown): value is ReportKey {
  return typeof value === "string" && REPORTS.some((report) => report.key === value);
}
