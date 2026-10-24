import "server-only";

import type { IncidentResolution } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { DomainError } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { changeAssetState, putBack, resolveQuarantine } from "@/lib/inventory/availability";
import { waiveCharge } from "@/lib/payments/charges";
import { syncAutomaticRestriction } from "../access";
import type { Actor } from "./common";

/**
 * A manager closes a lost or damaged incident. FOUND puts lost units back on
 * a shelf; REPAIRED takes damaged units off the repair shelf; WRITTEN_OFF
 * scraps damaged units; WAIVED also waives the charge (with the note as
 * reason). Closing the last open incident lifts an automatic restriction.
 * When the damaged units went to repair, the repair owns them: closing the
 * repair releases the stock, so this only records the resolution.
 */
export async function resolveIncident(tx: Tx, input: { spaceId: string; incidentId: string; resolution: IncidentResolution; note: string; locationId?: string | null }, actor: Actor) {
  const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "LoanIncident" WHERE "id" = ${input.incidentId} AND "spaceId" = ${input.spaceId} FOR UPDATE`;
  if (!row) throw new DomainError("That incident wasn't found.", "not_found");
  const incident = await tx.loanIncident.findUniqueOrThrow({ where: { id: input.incidentId }, include: { line: { select: { itemId: true, locationId: true } }, repair: { select: { status: true } } } });
  if (incident.status !== "OPEN") throw new DomainError("That incident is already resolved.", "conflict");
  const note = input.note.trim();
  if (!note) throw new DomainError("Add a short note about how it was resolved.", "invalid");
  const ref = { refType: "LoanIncident", refId: incident.id };
  const locationId = input.locationId ?? incident.line.locationId;
  if (input.resolution === "FOUND") {
    if (incident.kind !== "LOST") throw new DomainError("Only lost items can be found.", "invalid");
    if (!locationId) throw new DomainError("Choose where the found item goes.", "invalid");
    if (incident.assetId) await changeAssetState(tx, { spaceId: input.spaceId, assetId: incident.assetId, action: "found", locationId }, actor, ref);
    else await putBack(tx, { spaceId: input.spaceId, itemId: incident.line.itemId, locationId, good: incident.quantity, damaged: 0, type: "RETURN" }, actor, ref);
  } else if (incident.kind === "DAMAGED" && (input.resolution === "REPAIRED" || input.resolution === "WRITTEN_OFF") && (!incident.repair || incident.repair.status === "CANCELLED")) {
    if (incident.assetId) {
      await changeAssetState(tx, { spaceId: input.spaceId, assetId: incident.assetId, action: input.resolution === "REPAIRED" ? "repair" : "retire" }, actor, ref);
    } else if (locationId) {
      // Units returned damaged sit on the repair shelf where they were put back.
      const level = await tx.stockLevel.findUnique({ where: { itemId_locationId: { itemId: incident.line.itemId, locationId } }, select: { quarantined: true } });
      const quantity = Math.min(incident.quantity, level?.quarantined ?? 0);
      if (quantity > 0) await resolveQuarantine(tx, { spaceId: input.spaceId, itemId: incident.line.itemId, locationId, quantity, outcome: input.resolution === "REPAIRED" ? "repair" : "scrap" }, actor, ref);
    }
  }
  // A found item owes nothing; a waiver cancels the charge with the note as reason.
  if (input.resolution === "WAIVED" || input.resolution === "FOUND") {
    const charges = await tx.loanCharge.findMany({ where: { incidentId: incident.id, status: "DUE" }, select: { id: true } });
    for (const charge of charges) await waiveCharge(tx, { spaceId: input.spaceId, chargeId: charge.id, reason: note, actorId: actor.userId });
  }
  await tx.loanIncident.update({ where: { id: incident.id }, data: { status: "RESOLVED", resolution: input.resolution, resolutionNote: note.slice(0, 1000), resolvedById: actor.userId, resolvedAt: new Date() } });
  await syncAutomaticRestriction(tx, { spaceId: input.spaceId, userId: incident.borrowerId });
  await recordAuditEvent({ client: tx, action: "incident.resolved", spaceId: input.spaceId, actorId: actor.userId, actorApiTokenId: actor.apiTokenId ?? null, targetType: "LoanIncident", targetId: incident.id, metadata: { resolution: input.resolution } });
  await emitEvent(tx, { spaceId: input.spaceId, type: "incident.resolved", data: { incidentId: incident.id, loanId: incident.loanId, resolution: input.resolution } });
}
