import "server-only";

import { formatDate } from "@/lib/format/datetime";
import { incidentsReport, incidentsTables } from "./incidents";
import { REPORTS, type ReportKey } from "./keys";
import { loansReport, loansTables } from "./loans";
import { movementReport, movementTables } from "./movements";
import { paymentsReport, paymentsTables } from "./payments";
import { repairsReport, repairsTables } from "./repairs";
import { spendReport, spendTables } from "./spend";
import type { DateRange } from "./range";
import { lowStockReport, lowStockTables, valuationReport, valuationTables } from "./stock";
import type { ReportTable } from "./table";
import { transfersReport, transfersTables } from "./transfers";

export { REPORTS, isReportKey, type ReportKey } from "./keys";

type SpaceInfo = { id: string; timezone: string };

/** Build the export tables for one report (the same numbers the page shows). */
export async function reportTables(key: ReportKey, space: SpaceInfo, range: DateRange): Promise<{ title: string; tables: ReportTable[] }> {
  const day = (date: Date) => formatDate(date, space.timezone);
  const title = REPORTS.find((report) => report.key === key)!.label;
  switch (key) {
    case "valuation":
      return { title, tables: [...valuationTables(await valuationReport(space.id)), ...spendTables(await spendReport(space.id))] };
    case "low-stock":
      return { title, tables: lowStockTables(await lowStockReport(space.id)) };
    case "movements":
      return { title, tables: movementTables(await movementReport(space.id, range, space.timezone)) };
    case "loans":
      return { title, tables: loansTables(await loansReport(space.id, range), day) };
    case "incidents":
      return { title, tables: incidentsTables(await incidentsReport(space.id, range)) };
    case "transfers":
      return { title, tables: transfersTables(await transfersReport(space.id, range), day) };
    case "payments":
      return { title, tables: paymentsTables(await paymentsReport(space.id, range)) };
    case "repairs":
      return { title, tables: repairsTables(await repairsReport(space.id, range, space.timezone)) };
  }
}
