import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apiJson, withApi } from "@/lib/api/context";
import { memberDto } from "@/lib/api/dto";
import { afterCursor, enumParam, pageOf, parsePage } from "@/lib/api/pagination";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROLES = ["OWNER", "ADMIN", "MANAGER", "STAFF", "MEMBER"] as const;
const STANDING = ["GOOD", "RESTRICTED", "SUSPENDED"] as const;
const STATUSES = ["ACTIVE", "SUSPENDED"] as const;

/**
 * GET /api/v1/members?role=&borrowing=&status= (read:members): membership
 * id, name, role and borrowing standing. Never emails, phones or MFA state.
 */
export async function GET(request: Request) {
  return withApi(request, "read", "read:members", async ({ spaceId, params }) => {
    const page = parsePage(params);
    const role = enumParam(params, "role", ROLES);
    const borrowingStatus = enumParam(params, "borrowing", STANDING);
    const status = enumParam(params, "status", STATUSES);
    const where: Prisma.MembershipWhereInput = { spaceId, ...afterCursor(page), ...(role ? { role } : {}), ...(borrowingStatus ? { borrowingStatus } : {}), ...(status ? { status } : {}) };
    const rows = await prisma.membership.findMany({
      where,
      select: { id: true, role: true, status: true, borrowingStatus: true, joinedAt: true, user: { select: { name: true } } },
      orderBy: { id: "asc" },
      take: page.limit + 1,
    });
    const { rows: members, nextCursor } = pageOf(rows, page.limit);
    return apiJson({ data: members.map(memberDto), nextCursor });
  });
}
