import { prisma } from "@/lib/db";
import { apiJson, notFoundResponse, parseOptionalBody, validId, withApi } from "@/lib/api/context";
import { loanDto, loanSelect } from "@/lib/api/dto";
import { apiLoanAction } from "@/lib/api/loans";
import { approveSchema, cancelSchema, LOAN_ACTIONS, rejectSchema, type LoanApiAction } from "@/lib/api/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCHEMAS = { approve: approveSchema, reject: rejectSchema, cancel: cancelSchema } as const;

/**
 * POST /api/v1/loans/{id}/approve | reject | cancel (write:loans).
 * approve: `{ quantities?: { [lineId]: units } }`; reject: `{ reason }`; cancel: `{ reason? }`.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await context.params;
  return withApi(request, "write", "write:loans", async ({ spaceId, actor }) => {
    if (!(LOAN_ACTIONS as readonly string[]).includes(action)) return notFoundResponse("action");
    if (!validId(id)) return notFoundResponse("loan");
    const step = action as LoanApiAction;
    const body = await parseOptionalBody(request, SCHEMAS[step]);
    await prisma.$transaction((tx) => apiLoanAction(tx, spaceId, id, step, body, actor));
    const loan = await prisma.loan.findUniqueOrThrow({ where: { id }, select: loanSelect(spaceId) });
    return apiJson({ data: loanDto(loan) });
  });
}
