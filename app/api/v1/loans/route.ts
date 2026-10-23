import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apiJson, parseBody, withApi } from "@/lib/api/context";
import { loanDto, loanSelect } from "@/lib/api/dto";
import { apiRequestLoan } from "@/lib/api/loans";
import { afterCursor, booleanParam, enumParam, idParam, pageOf, parsePage } from "@/lib/api/pagination";
import { loanRequestSchema } from "@/lib/api/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "CANCELLED", "ISSUED", "PARTIALLY_RETURNED", "RETURNED", "CLOSED_WITH_ISSUE"] as const;

/** GET /api/v1/loans?status=&member=&overdue=true (read:loans). */
export async function GET(request: Request) {
  return withApi(request, "read", "read:loans", async ({ spaceId, params }) => {
    const page = parsePage(params);
    const status = enumParam(params, "status", STATUSES);
    const memberId = idParam(params, "member");
    const overdue = booleanParam(params, "overdue") ?? false;
    let borrowerId: string | undefined;
    if (memberId) {
      const membership = await prisma.membership.findFirst({ where: { id: memberId, spaceId }, select: { userId: true } });
      if (!membership) return apiJson({ data: [], nextCursor: null });
      borrowerId = membership.userId;
    }
    const where: Prisma.LoanWhereInput = {
      spaceId,
      ...afterCursor(page),
      ...(status ? { status } : {}),
      ...(borrowerId ? { borrowerId } : {}),
      ...(overdue ? { status: { in: ["ISSUED", "PARTIALLY_RETURNED"] }, dueAt: { lt: new Date() } } : {}),
    };
    const rows = await prisma.loan.findMany({ where, select: loanSelect(spaceId), orderBy: { id: "asc" }, take: page.limit + 1 });
    const { rows: loans, nextCursor } = pageOf(rows, page.limit);
    return apiJson({ data: loans.map((loan) => loanDto(loan)), nextCursor });
  });
}

/**
 * POST /api/v1/loans (write:loans): request a loan for a member,
 * `{ memberId, lines: [{ itemId, quantity }], purpose?, neededFrom? }`.
 * Items that skip approval are approved at once.
 */
export async function POST(request: Request) {
  return withApi(request, "write", "write:loans", async ({ spaceId, actor }) => {
    const input = await parseBody(request, loanRequestSchema);
    const created = await prisma.$transaction((tx) => apiRequestLoan(tx, spaceId, input, actor));
    const loan = await prisma.loan.findUniqueOrThrow({ where: { id: created.id }, select: loanSelect(spaceId) });
    return apiJson({ data: loanDto(loan) }, 201);
  });
}
