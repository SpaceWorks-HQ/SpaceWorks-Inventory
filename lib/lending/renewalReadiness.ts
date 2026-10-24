import "server-only";

import type { DbClient } from "@/lib/db";
import type { RenewalFacts } from "./renewalPolicy";

/** Read the same tenant-scoped facts for the locked workflow and the loan pages. */
export async function renewalFacts(client: DbClient, spaceId: string, borrowerId: string, outstandingItemIds: string[]): Promise<RenewalFacts> {
  const [membership, openIncidents, waitingRequests] = await Promise.all([
    client.membership.findUnique({ where: { userId_spaceId: { userId: borrowerId, spaceId } }, select: { borrowingStatus: true } }),
    client.loanIncident.count({ where: { spaceId, borrowerId, status: "OPEN" } }),
    client.loanLine.count({ where: { itemId: { in: outstandingItemIds }, loan: { spaceId, status: { in: ["REQUESTED", "APPROVED"] }, NOT: { borrowerId } } } }),
  ]);
  return { borrowingStatus: membership?.borrowingStatus ?? null, openIncidents, waitingRequests };
}
