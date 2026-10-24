// Generated from app/s/[spaceSlug]/finance/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { financeReport, financeTables, ledgerCheck } from "@/lib/finance";
import { isPeriodGroup } from "@/lib/finance/periods";
import { requireSpace } from "@/lib/permissions";
import { parseRange } from "@/lib/reports/range";

export async function loadFinancePage({ params, searchParams }: PageProps<"/s/[spaceSlug]/finance">) {
const { spaceSlug } = await params;
const query = await searchParams;
const { space } = await requireSpace(spaceSlug, "MANAGER");
const range = parseRange({ from: query.from, to: query.to }, space.timezone, new Date(), 366 * 5);
const group = isPeriodGroup(query.group) ? query.group : "month";
const [report, check] = await Promise.all([financeReport({ id: space.id, slug: space.slug, timezone: space.timezone }, range, group), ledgerCheck(space.id)]);
const tables = financeTables(report);
const currency = space.currency;
const exportBase = `/s/${space.slug}/finance/export?from=${range.fromDay}&to=${range.toDay}&group=${group}`;
return viewDto({ space, range, group, report, check, tables, currency, exportBase } as const);
}
