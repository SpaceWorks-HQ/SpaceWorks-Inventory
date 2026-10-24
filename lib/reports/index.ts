/**
 * Reports: read-only summaries for managers, the REST API and exports.
 * Every builder filters by `spaceId`; callers check the viewer's role first.
 */
export { valuationReport, valuationTables, lowStockReport, lowStockTables, type ValuationReport, type LowStockRow } from "./stock";
export { overdueLoansReport, loansReport, loansTables, daysOverdue, type OverdueLoanRow, type LoansReport } from "./loans";
export { movementReport, movementTables, type MovementReport } from "./movements";
export { incidentsReport, incidentsTables, type IncidentsReport } from "./incidents";
export { transfersReport, transfersTables, type TransfersReport } from "./transfers";
export { paymentsReport, paymentsTables, type PaymentsReport } from "./payments";
export { repairsReport, repairsTables, type RepairsReport } from "./repairs";
export { spendReport, spendTables, type SpendReport } from "./spend";
export { parseRange, dayInZone, type DateRange } from "./range";
export { REPORTS, isReportKey, reportTables, type ReportKey } from "./registry";
