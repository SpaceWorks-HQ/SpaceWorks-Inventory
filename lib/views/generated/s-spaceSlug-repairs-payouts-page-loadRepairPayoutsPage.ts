// Generated from app/s/[spaceSlug]/repairs/payouts/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/permissions";

export async function loadRepairPayoutsPage({ params }: PageProps<"/s/[spaceSlug]/repairs/payouts">) {
const { spaceSlug } = await params;
const { space } = await requireSpace(spaceSlug, "MANAGER");
const [payouts, owed] = await Promise.all([
    prisma.repairPayout.findMany({ where: { spaceId: space.id }, orderBy: { paidAt: "desc" }, take: 500, include: { issue: { select: { id: true, number: true, title: true } }, technician: { select: { name: true } } } }),
    prisma.repairIssue.findMany({ where: { spaceId: space.id, approvedMinor: { gt: 0 }, status: { not: "CANCELLED" } }, select: { approvedMinor: true, payouts: { select: { amountMinor: true } } } }),
  ]);
const unpaid = owed.reduce((sum, issue) => sum + Math.max(0, (issue.approvedMinor ?? 0) - issue.payouts.reduce((paid, payout) => paid + payout.amountMinor, 0)), 0);
const total = payouts.reduce((sum, payout) => sum + payout.amountMinor, 0);
const currency = space.currency;
const slug = space.slug;
return viewDto({ space, payouts, unpaid, total, currency, slug } as const);
}
