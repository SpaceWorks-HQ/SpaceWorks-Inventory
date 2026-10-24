import "server-only";
import { z } from "zod";
import type { Actor, OperationDefinition } from "@spaceworks-hq/agents/helper";
import { DomainError } from "@spaceworks-hq/agents/helper";
import { prisma, type Tx } from "@/lib/db";
import { receiptSchema, adjustmentSchema } from "@/lib/api/schemas";
import { receiveStock, adjustStock, availableOf } from "@/lib/inventory/availability";
import { recordAuditEvent } from "@/lib/audit";
import { emitEvent } from "@/lib/events/emit";
import { approveLoan, requestLoan } from "@/lib/lending/workflow";

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const request = z.object({ itemId: id, quantity: z.number().int().min(1).max(99), memberId: id.optional(),
  purpose: z.string().trim().min(1).max(500), neededFrom: z.iso.datetime({ offset: true }).optional() }).strict();
const approve = z.object({ loanId: id }).strict();
export const OPERATION_DEFINITIONS: OperationDefinition[] = [
  { name: "stock.receive", description: "Record a verified quantity-stock receipt at a real location", roles: ["manager"], fields: ["itemId", "locationId", "quantity", "reason", "note"] },
  { name: "stock.adjust", description: "Adjust verified quantity stock with a reason; held stock stays protected", roles: ["manager"], fields: ["itemId", "locationId", "delta", "reason", "note"] },
  { name: "lending.request", description: "Request a real catalogue item; approval, fees and physical handover follow host policy", roles: ["manager", "staff", "member"], fields: ["itemId", "quantity", "memberId", "purpose", "neededFrom"] },
  { name: "lending.approve", description: "Approve a requested loan and reserve its native stock holds", roles: ["manager", "staff"], fields: ["loanId"] },
];

export function assertAgentOperation(actor: Actor, name: string) {
  const definition = OPERATION_DEFINITIONS.find(value => value.name === name);
  if (!definition) throw new DomainError("UNKNOWN_OPERATION", "Use a supported operation or the authenticated lending desk.", 404);
  if (!definition.roles.includes(actor.role)) throw new DomainError("FORBIDDEN", "Your current host role cannot perform this operation.", 403);
}

async function assertStockTargets(tx: Tx, spaceId: string, itemId: string, locationId: string) {
  const [item, location] = await Promise.all([
    tx.item.findFirst({ where: { id: itemId, spaceId, archivedAt: null }, select: { id: true, tracking: true } }),
    tx.location.findFirst({ where: { id: locationId, spaceId, archivedAt: null }, select: { id: true } }),
  ]);
  if (!item || !location) throw new DomainError("NOT_FOUND", "That item or location was not found.", 404);
  if (item.tracking === "SERIALIZED") throw new DomainError("HOST_DESK_REQUIRED", "Use the host asset desk for serialized units and required physical evidence.", 409);
}

/** Only native availability/workflow services write business state. */
export async function performAgentOperation(tx: Tx, actor: Actor, name: string, raw: Record<string, unknown>) {
  const by = { userId: actor.id };
  if (name === "stock.receive" || name === "stock.adjust") {
    const input = name === "stock.receive" ? receiptSchema.parse(raw) : adjustmentSchema.parse(raw);
    await assertStockTargets(tx, actor.tenantId, input.itemId, input.locationId);
    const level = "quantity" in input
      ? await receiveStock(tx, { ...input, spaceId: actor.tenantId }, by, { refType: "AgentReceipt", note: input.note })
      : await adjustStock(tx, { ...input, spaceId: actor.tenantId }, by, { refType: "AgentAdjustment", note: input.note });
    const change = "quantity" in input ? input.quantity : input.delta;
    await recordAuditEvent({ client: tx, action: name === "stock.receive" ? "stock.received" : "stock.adjusted", spaceId: actor.tenantId,
      actorId: actor.id, targetType: "Item", targetId: input.itemId, metadata: { via: "agent", locationId: input.locationId, quantity: change, reason: input.reason } });
    await emitEvent(tx, { spaceId: actor.tenantId, type: "stock.adjusted", data: { itemId: input.itemId, locationId: input.locationId, change, reason: input.reason } });
    return { itemId: level.itemId, locationId: level.locationId, onHand: level.onHand, reserved: level.reserved, quarantined: level.quarantined, available: availableOf(level) };
  }
  if (name === "lending.request") {
    const input = request.parse(raw);
    let borrowerId = actor.id;
    if (input.memberId) {
      const member = await tx.membership.findFirst({ where: { id: input.memberId, spaceId: actor.tenantId, status: "ACTIVE" }, select: { userId: true } });
      if (!member || (actor.role === "member" && member.userId !== actor.id)) throw new DomainError("NOT_FOUND", "That member was not found.", 404);
      borrowerId = member.userId;
    }
    const loan = await requestLoan(tx, { spaceId: actor.tenantId, borrowerId, lines: [{ itemId: input.itemId, quantity: input.quantity }], purpose: input.purpose, neededFrom: input.neededFrom ? new Date(input.neededFrom) : null }, by);
    const current = await tx.loan.findUniqueOrThrow({ where: { id: loan.id }, select: { id: true, status: true, dueAt: true } });
    return { loanId: current.id, status: current.status, dueAt: current.dueAt.toISOString(), next: "Use the authenticated lending desk for approval, payment and QR/photo handover as required." };
  }
  if (name === "lending.approve") {
    const input = approve.parse(raw);
    await approveLoan(tx, { spaceId: actor.tenantId, loanId: input.loanId, quantities: null }, by);
    return { loanId: input.loanId, status: "APPROVED", next: "Physical QR scans and photographs are still required at the host desk." };
  }
  throw new DomainError("UNKNOWN_OPERATION", "That operation is unavailable.", 404);
}

/** Bounded diagnostic count, not a second task/loan ledger. */
export async function pendingDeskWork(spaceId: string) {
  const [requests, overdue] = await Promise.all([
    prisma.loan.count({ where: { spaceId, status: "REQUESTED" } }),
    prisma.loan.count({ where: { spaceId, status: { in: ["ISSUED", "PARTIALLY_RETURNED"] }, dueAt: { lt: new Date() } } }),
  ]);
  return { requests, overdue };
}
