import "server-only";

import type { Technician } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { repairRef } from "@/lib/catalogue/references";
import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { notifyUsers } from "@/lib/notify";
import { canWorkRepairs } from "@/lib/roles";
import { addTimeline, lockIssue, managerIds, repairPath, type RepairActor } from "./common";
import { sendRequestMessages, tellTechnician } from "./notify";
import { createRepairLinkToken, requestExpiry } from "./tokens";

/**
 * Repair requests: a manager picks technicians and each gets the request on
 * every channel they have. The first to accept is assigned (the repair row
 * is locked, so two accepts can't both win); the others are told it's taken
 * and their links close. A manager may also assign someone directly.
 */

async function context(tx: Tx, spaceId: string, issueId: string) {
  const issue = await lockIssue(tx, spaceId, issueId);
  const [space, item] = await Promise.all([
    tx.space.findUniqueOrThrow({ where: { id: spaceId }, select: { id: true, slug: true, name: true, repairRequestDays: true } }),
    tx.item.findUniqueOrThrow({ where: { id: issue.itemId }, select: { name: true } }),
  ]);
  return { issue, space, facts: { ...issue, itemName: item.name } };
}

/** Members in the directory must still be active members who may repair. */
async function eligible(tx: Tx, spaceId: string, technician: Technician) {
  if (!technician.active) return false;
  if (technician.kind === "EXTERNAL") return Boolean(technician.email);
  if (!technician.userId) return false;
  const membership = await tx.membership.findUnique({ where: { userId_spaceId: { userId: technician.userId, spaceId } }, select: { role: true, status: true } });
  return membership?.status === "ACTIVE" && canWorkRepairs(membership);
}

async function issueRequest(tx: Tx, ctx: Awaited<ReturnType<typeof context>>, technician: Technician, actor: RepairActor, status: "SENT" | "ACCEPTED") {
  const expiresAt = requestExpiry(ctx.space.repairRequestDays);
  const link = technician.kind === "EXTERNAL" ? createRepairLinkToken() : null;
  const values = { status, tokenHash: link?.tokenHash ?? null, expiresAt, sentById: actor.userId, sentAt: new Date(), respondedAt: status === "ACCEPTED" ? new Date() : null };
  const request = await tx.repairRequest.upsert({
    where: { issueId_technicianId: { issueId: ctx.issue.id, technicianId: technician.id } },
    create: { spaceId: ctx.space.id, issueId: ctx.issue.id, technicianId: technician.id, ...values },
    update: values,
  });
  const channels = await sendRequestMessages(tx, ctx.space, ctx.facts, technician, { token: link?.token ?? null, expiresAt }, status === "ACCEPTED");
  await tx.repairRequest.update({ where: { id: request.id }, data: { channels } });
  return { request, channels };
}

/** Close every other open request and tell those technicians the job is taken. */
async function closeOthers(tx: Tx, ctx: Awaited<ReturnType<typeof context>>, keepTechnicianId: string) {
  const open = await tx.repairRequest.findMany({ where: { issueId: ctx.issue.id, status: "SENT", NOT: { technicianId: keepTechnicianId } }, include: { technician: true } });
  for (const other of open) {
    await tx.repairRequest.update({ where: { id: other.id }, data: { status: "CLOSED", respondedAt: new Date() } });
    await tellTechnician(tx, ctx.space, ctx.issue.id, other.technician, { kind: "repair.taken", title: `${repairRef(ctx.issue.number)} has been taken`, body: "Another technician took this repair, so the request is closed. Thank you." });
  }
}

export async function sendRepairRequests(tx: Tx, input: { spaceId: string; issueId: string; technicianIds: string[] }, actor: RepairActor) {
  const ctx = await context(tx, input.spaceId, input.issueId);
  if (ctx.issue.status !== "REPORTED") throw new DomainError("Requests go out only while the repair waits for a technician.", "conflict");
  const ids = [...new Set(input.technicianIds)];
  if (ids.length === 0) throw new DomainError("Choose at least one technician.");
  const technicians = await tx.technician.findMany({ where: { id: { in: ids }, spaceId: input.spaceId } });
  if (technicians.length !== ids.length) throw new DomainError("That technician wasn't found.", "not_found");
  const now = new Date();
  let sent = 0;
  for (const technician of technicians) {
    if (!(await eligible(tx, input.spaceId, technician))) throw new DomainError(`${technician.name} can't take repairs right now.`, "conflict");
    const existing = await tx.repairRequest.findUnique({ where: { issueId_technicianId: { issueId: ctx.issue.id, technicianId: technician.id } }, select: { status: true, expiresAt: true } });
    if (existing?.status === "SENT" && existing.expiresAt > now) continue;
    const { channels } = await issueRequest(tx, ctx, technician, actor, "SENT");
    await addTimeline(tx, { spaceId: input.spaceId, issueId: ctx.issue.id, kind: "requested", actor, technicianId: technician.id, channel: channels.join(",") });
    sent += 1;
  }
  await recordAuditEvent({ client: tx, action: "repair.requests_sent", spaceId: input.spaceId, actorId: actor.userId, targetType: "RepairIssue", targetId: ctx.issue.id, metadata: { technicians: sent } });
  return { sent };
}

async function assign(tx: Tx, ctx: Awaited<ReturnType<typeof context>>, technician: Technician, actor: RepairActor, kind: "accepted" | "assigned") {
  await tx.repairIssue.update({ where: { id: ctx.issue.id }, data: { status: "ASSIGNED", assignedTechnicianId: technician.id } });
  await closeOthers(tx, ctx, technician.id);
  await addTimeline(tx, { spaceId: ctx.space.id, issueId: ctx.issue.id, kind, actor, technicianId: technician.id });
  await emitEvent(tx, { spaceId: ctx.space.id, type: "issue.assigned", data: { issueId: ctx.issue.id, reference: repairRef(ctx.issue.number), technicianId: technician.id } });
  await notifyUsers(tx, ctx.space.id, await managerIds(tx, ctx.space.id), { kind: "repair.assigned", title: `${repairRef(ctx.issue.number)} is with ${technician.name}`, url: repairPath(ctx.space.slug, ctx.issue.id) }, { excludeUserId: actor.userId });
}

/** A technician accepts a request (in the app, or through their link with `technicianId`). First accept wins. */
export async function acceptRepairRequest(tx: Tx, input: { spaceId: string; requestId: string }, actor: RepairActor) {
  const found = await tx.repairRequest.findFirst({ where: { id: input.requestId, spaceId: input.spaceId }, select: { issueId: true } });
  if (!found) throw new DomainError("That request wasn't found.", "not_found");
  const ctx = await context(tx, input.spaceId, found.issueId);
  const request = await tx.repairRequest.findUniqueOrThrow({ where: { id: input.requestId }, include: { technician: true } });
  if (actor.technicianId && actor.technicianId !== request.technicianId) throw new DomainError("That request wasn't found.", "not_found");
  if (request.status !== "SENT") throw new DomainError("This request is no longer open.", "conflict");
  if (request.expiresAt <= new Date()) {
    await tx.repairRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
    throw new DomainError("This request has expired. Ask the space to send it again.", "conflict");
  }
  if (ctx.issue.status !== "REPORTED") {
    await tx.repairRequest.update({ where: { id: request.id }, data: { status: "CLOSED", respondedAt: new Date() } });
    throw new DomainError("Someone else already took this repair.", "conflict");
  }
  await tx.repairRequest.update({ where: { id: request.id }, data: { status: "ACCEPTED", respondedAt: new Date(), expiresAt: requestExpiry(ctx.space.repairRequestDays) } });
  await assign(tx, ctx, request.technician, { ...actor, technicianId: request.technicianId }, "accepted");
  await recordAuditEvent({ client: tx, action: "repair.accepted", spaceId: input.spaceId, actorId: actor.userId, targetType: "RepairIssue", targetId: ctx.issue.id, metadata: { technicianId: request.technicianId } });
}

export async function declineRepairRequest(tx: Tx, input: { spaceId: string; requestId: string; reason: string | null }, actor: RepairActor) {
  const request = await tx.repairRequest.findFirst({ where: { id: input.requestId, spaceId: input.spaceId }, include: { technician: { select: { name: true } }, issue: { select: { number: true, space: { select: { slug: true } } } } } });
  if (!request || (actor.technicianId && actor.technicianId !== request.technicianId)) throw new DomainError("That request wasn't found.", "not_found");
  const updated = await tx.repairRequest.updateMany({ where: { id: request.id, status: "SENT" }, data: { status: "DECLINED", respondedAt: new Date() } });
  if (updated.count !== 1) throw new DomainError("This request is no longer open.", "conflict");
  await addTimeline(tx, { spaceId: input.spaceId, issueId: request.issueId, kind: "declined", actor, technicianId: request.technicianId, text: input.reason });
  await notifyUsers(tx, input.spaceId, await managerIds(tx, input.spaceId), { kind: "repair.declined", title: `${request.technician.name} declined ${repairRef(request.issue.number)}`, url: repairPath(request.issue.space.slug, request.issueId) });
}

/** A manager gives the repair to one technician without waiting for answers. */
export async function assignTechnician(tx: Tx, input: { spaceId: string; issueId: string; technicianId: string }, actor: RepairActor) {
  const ctx = await context(tx, input.spaceId, input.issueId);
  if (ctx.issue.status !== "REPORTED") throw new DomainError("Only a repair waiting for a technician can be assigned. Unassign it first.", "conflict");
  const technician = await tx.technician.findFirst({ where: { id: input.technicianId, spaceId: input.spaceId } });
  if (!technician) throw new DomainError("That technician wasn't found.", "not_found");
  if (!(await eligible(tx, input.spaceId, technician))) throw new DomainError(`${technician.name} can't take repairs right now.`, "conflict");
  const { channels } = await issueRequest(tx, ctx, technician, actor, "ACCEPTED");
  await assign(tx, ctx, technician, actor, "assigned");
  await addTimeline(tx, { spaceId: input.spaceId, issueId: ctx.issue.id, kind: "requested", actor, technicianId: technician.id, channel: channels.join(",") });
  await recordAuditEvent({ client: tx, action: "repair.assigned", spaceId: input.spaceId, actorId: actor.userId, targetType: "RepairIssue", targetId: ctx.issue.id, metadata: { technicianId: technician.id } });
}

/** Take the repair back from its technician (their link closes); it waits for a technician again. */
export async function unassignTechnician(tx: Tx, input: { spaceId: string; issueId: string; reason: string }, actor: RepairActor) {
  const ctx = await context(tx, input.spaceId, input.issueId);
  if (ctx.issue.status !== "ASSIGNED" || !ctx.issue.assignedTechnicianId) throw new DomainError("Only a repair that is being worked on can be unassigned.", "conflict");
  if (!input.reason.trim()) throw new DomainError("Say why the technician is taken off this repair.");
  const technician = await tx.technician.findUniqueOrThrow({ where: { id: ctx.issue.assignedTechnicianId } });
  await tx.repairRequest.updateMany({ where: { issueId: ctx.issue.id, technicianId: technician.id }, data: { status: "CLOSED", tokenHash: null } });
  await tx.repairIssue.update({ where: { id: ctx.issue.id }, data: { status: "REPORTED", assignedTechnicianId: null } });
  await addTimeline(tx, { spaceId: input.spaceId, issueId: ctx.issue.id, kind: "unassigned", actor, technicianId: technician.id, text: input.reason });
  await tellTechnician(tx, ctx.space, ctx.issue.id, technician, { kind: "repair.unassigned", title: `${repairRef(ctx.issue.number)} was taken off you`, body: "The space has taken this repair back, so your link no longer works." });
}

/** Withdraw a request that hasn't been answered (its link stops working). */
export async function withdrawRepairRequest(tx: Tx, input: { spaceId: string; requestId: string }, actor: RepairActor) {
  const request = await tx.repairRequest.findFirst({ where: { id: input.requestId, spaceId: input.spaceId } });
  if (!request) throw new DomainError("That request wasn't found.", "not_found");
  const updated = await tx.repairRequest.updateMany({ where: { id: request.id, status: "SENT" }, data: { status: "CLOSED", tokenHash: null, respondedAt: new Date() } });
  if (updated.count !== 1) throw new DomainError("This request is no longer open.", "conflict");
  await addTimeline(tx, { spaceId: input.spaceId, issueId: request.issueId, kind: "withdrawn", actor, technicianId: request.technicianId });
}
