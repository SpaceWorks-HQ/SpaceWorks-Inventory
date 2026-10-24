// Generated from app/s/[spaceSlug]/my-loans/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { loanRef } from "@/lib/catalogue/references";
import { prisma } from "@/lib/db";
import { memberLoans } from "@/lib/desk/loansMember";
import { formatDayShort, formatRelativeDay } from "@/lib/format/datetime";
import { checkBorrowingEligibility } from "@/lib/lending/access";
import { isOverdue } from "@/lib/lending/policy";
import { requireSpace } from "@/lib/permissions";

export async function loadMyLoansPage({ params }: PageProps<"/s/[spaceSlug]/my-loans">) {
const { spaceSlug } = await params;
const { space, user } = await requireSpace(spaceSlug, "MEMBER");
const loans = await memberLoans(space.id, user.id);
const eligibility = await checkBorrowingEligibility(prisma, { spaceId: space.id, userId: user.id, incomingUnits: 0 });
const blocked = eligibility.ok ? null : eligibility.error;
const now = new Date();
const tz = space.timezone;
const rows = loans.map((loan) => ({
    id: loan.id,
    reference: loanRef(loan.number),
    status: loan.status,
    overdue: isOverdue(loan, now),
    items: loan.items,
    out: loan.out,
    open: loan.open,
    dateLabel: loan.open ? `Due ${formatRelativeDay(loan.dueAt, tz, now)}` : formatDayShort(loan.createdAt, tz, now),
  }));
const open = rows.filter((row) => row.open);
const past = rows.filter((row) => !row.open);
const slug = space.slug;
const lendingOn = space.lendingEnabled;
return viewDto({ blocked, rows, open, past, slug, lendingOn } as const);
}
