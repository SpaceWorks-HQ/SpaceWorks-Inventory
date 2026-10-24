"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { revalidatePath } from "@/lib/frontend/cache";
import { domainFailure, spaceAction } from "@/lib/actionContext";
import { actionError, validationError, type ActionResult } from "@/lib/actionResult";
import type { SpaceContext } from "@/lib/permissions";
import { readHandoverForm, withEvidencePhotos } from "@/lib/desk/photos";
import { parseMoneyToMinor } from "@/lib/format/money";
import { createPurchase } from "@/lib/purchases";
import {
  acceptRepairRequest, approveRepairAmount, assignTechnician, cancelIssue, closeRepair, declineRepairRequest, recordRepairPayout, recordRepairWork,
  reopenRepair, reportFromIncident, reportIssue, repairViewer, sendRepairRequests, unassignTechnician, withdrawRepairRequest, MAX_REPAIR_PHOTOS,
} from "@/lib/repairs";
import { startOfDay } from "@/lib/reports/range";
import { canManageRepairs, canPayRepairs, canReportRepairs, canViewStock, canWorkRepairs } from "@/lib/roles";
import { idSchema } from "@/lib/validation";

/**
 * Repairs. Anyone in the space may report; inventory managers send requests,
 * assign, verify, close and pay; the assigned technician records the work.
 * Technicians (the role) need an authenticator app before they act.
 */

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const severity = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const MFA_NEEDED = "Set up an authenticator app (Account, Security) before working on repairs.";

function revalidate(slug: string, issueId?: string) {
  revalidatePath(`/s/${slug}/repairs`);
  if (issueId) revalidatePath(`/s/${slug}/repairs/${issueId}`);
}

function run<T>(ctx: SpaceContext, issueId: string | undefined, work: () => Promise<T>): Promise<ActionResult<T>> {
  return work().then((data) => {
    revalidate(ctx.space.slug, issueId);
    return { ok: true as const, data };
  }, (error) => domainFailure(error));
}

const reportSchema = z.object({
  itemId: idSchema,
  assetId: z.union([idSchema, z.literal(""), z.null()]).optional().transform((v) => v || null),
  title: text(120).min(1, "Say in a few words what is wrong."),
  description: text(2000).min(1, "Describe the problem."),
  severity,
  takeOutOfUse: z.boolean().default(false),
  quantity: z.number().int().min(0).max(100_000).default(0),
  locationId: z.union([idSchema, z.literal(""), z.null()]).optional().transform((v) => v || null),
});

export async function reportRepairAction(slug: string, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const { ctx, denied } = await spaceAction(slug, canReportRepairs, "repairReport");
  if (denied) return denied;
  const { payload, photos } = readHandoverForm(formData);
  const parsed = reportSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);
  // Only staff may take stock out of use; a member's report waits for a manager.
  const staff = canViewStock(ctx.membership);
  if (photos.length > MAX_REPAIR_PHOTOS) return actionError(`Attach at most ${MAX_REPAIR_PHOTOS} photos.`);
  return run(ctx, undefined, () => withEvidencePhotos(ctx.space.id, photos, (stored) => prisma.$transaction((tx) => reportIssue(tx, { ...parsed.data, spaceId: ctx.space.id, takeOutOfUse: staff && parsed.data.takeOutOfUse, photos: stored }, { userId: ctx.user.id }), { timeout: 30_000 })).then((issue) => ({ id: issue.id })));
}

export async function reportFromIncidentAction(slug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const { ctx, denied } = await spaceAction(slug, canManageRepairs);
  if (denied) return denied;
  const parsed = z.object({ incidentId: idSchema, severity }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  return run(ctx, undefined, () => prisma.$transaction((tx) => reportFromIncident(tx, { spaceId: ctx.space.id, ...parsed.data }, { userId: ctx.user.id })).then((issue) => ({ id: issue.id })));
}

const issueOnly = z.object({ issueId: idSchema });

export async function sendRepairRequestsAction(slug: string, input: unknown): Promise<ActionResult<{ sent: number }>> {
  const { ctx, denied } = await spaceAction(slug, canManageRepairs);
  if (denied) return denied;
  const parsed = issueOnly.extend({ technicianIds: z.array(idSchema).min(1, "Choose at least one technician.").max(30) }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  return run(ctx, parsed.data.issueId, () => prisma.$transaction((tx) => sendRepairRequests(tx, { spaceId: ctx.space.id, ...parsed.data }, { userId: ctx.user.id }), { timeout: 30_000 }));
}

export async function assignTechnicianAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canManageRepairs);
  if (denied) return denied;
  const parsed = issueOnly.extend({ technicianId: idSchema }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  return run(ctx, parsed.data.issueId, () => prisma.$transaction((tx) => assignTechnician(tx, { spaceId: ctx.space.id, ...parsed.data }, { userId: ctx.user.id })).then(() => null));
}

export async function unassignTechnicianAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canManageRepairs);
  if (denied) return denied;
  const parsed = issueOnly.extend({ reason: text(500) }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  return run(ctx, parsed.data.issueId, () => prisma.$transaction((tx) => unassignTechnician(tx, { spaceId: ctx.space.id, ...parsed.data }, { userId: ctx.user.id })).then(() => null));
}

export async function withdrawRepairRequestAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canManageRepairs);
  if (denied) return denied;
  const parsed = issueOnly.extend({ requestId: idSchema }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  return run(ctx, parsed.data.issueId, () => prisma.$transaction((tx) => withdrawRepairRequest(tx, { spaceId: ctx.space.id, requestId: parsed.data.requestId }, { userId: ctx.user.id })).then(() => null));
}

/** A member technician answers a request in the app. */
export async function respondRepairRequestAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canWorkRepairs);
  if (denied) return denied;
  const parsed = issueOnly.extend({ requestId: idSchema, accept: z.boolean(), reason: optionalText(500) }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const viewer = await repairViewer(ctx.space.id, ctx.user, ctx.membership);
  if (viewer.needsMfa) return actionError(MFA_NEEDED);
  if (!viewer.technicianId) return actionError("That request wasn't found.");
  const actor = { userId: ctx.user.id, technicianId: viewer.technicianId };
  return run(ctx, parsed.data.issueId, () => prisma.$transaction((tx) => (parsed.data.accept
    ? acceptRepairRequest(tx, { spaceId: ctx.space.id, requestId: parsed.data.requestId }, actor)
    : declineRepairRequest(tx, { spaceId: ctx.space.id, requestId: parsed.data.requestId, reason: parsed.data.reason }, actor))).then(() => null));
}

const workSchema = z.object({ issueId: idSchema, remarks: text(2000).default(""), partsUsed: optionalText(1000), amountAsked: z.string().trim().max(20).optional().nullable(), markFixed: z.boolean().default(false) });

/** Fix notes, parts, photos and the amount asked, from the assigned technician (or a manager on their behalf). */
export async function saveRepairWorkAction(slug: string, formData: FormData): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canWorkRepairs);
  if (denied) return denied;
  const { payload, photos } = readHandoverForm(formData);
  const parsed = workSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);
  const viewer = await repairViewer(ctx.space.id, ctx.user, ctx.membership);
  if (viewer.needsMfa) return actionError(MFA_NEEDED);
  const amountAskedMinor = parsed.data.amountAsked ? parseMoneyToMinor(parsed.data.amountAsked, ctx.space.currency) : null;
  if (parsed.data.amountAsked && amountAskedMinor === null) return actionError("Enter the amount as a number, for example 1500.", { amountAsked: ["Enter the amount as a number, for example 1500."] });
  const actor = { userId: ctx.user.id, technicianId: viewer.technicianId, manager: viewer.manage };
  return run(ctx, parsed.data.issueId, () => withEvidencePhotos(ctx.space.id, photos, (stored) => prisma.$transaction((tx) => recordRepairWork(tx, { spaceId: ctx.space.id, issueId: parsed.data.issueId, remarks: parsed.data.remarks, partsUsed: parsed.data.partsUsed, amountAskedMinor, photos: stored, markFixed: parsed.data.markFixed }, actor), { timeout: 30_000 })).then(() => null));
}

export async function closeRepairAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canManageRepairs);
  if (denied) return denied;
  const parsed = issueOnly.extend({ outcome: z.enum(["FIXED", "SCRAPPED"]), note: text(1000).default("") }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  return run(ctx, parsed.data.issueId, () => prisma.$transaction((tx) => closeRepair(tx, { spaceId: ctx.space.id, ...parsed.data }, { userId: ctx.user.id }), { timeout: 30_000 }).then(() => null));
}

export async function reopenRepairAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canManageRepairs);
  if (denied) return denied;
  const parsed = issueOnly.extend({ reason: text(1000) }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  return run(ctx, parsed.data.issueId, () => prisma.$transaction((tx) => reopenRepair(tx, { spaceId: ctx.space.id, ...parsed.data }, { userId: ctx.user.id })).then(() => null));
}

export async function cancelRepairAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canManageRepairs);
  if (denied) return denied;
  const parsed = issueOnly.extend({ reason: text(1000) }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  return run(ctx, parsed.data.issueId, () => prisma.$transaction((tx) => cancelIssue(tx, { spaceId: ctx.space.id, ...parsed.data }, { userId: ctx.user.id }), { timeout: 30_000 }).then(() => null));
}

function minor(value: string, currency: string) {
  return parseMoneyToMinor(value, currency);
}

export async function approveRepairAmountAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canPayRepairs);
  if (denied) return denied;
  const parsed = issueOnly.extend({ amount: text(20).min(1, "Enter the amount to pay."), note: optionalText(500) }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const amountMinor = minor(parsed.data.amount, ctx.space.currency);
  if (amountMinor === null) return actionError("Enter the amount as a number, for example 1500.", { amount: ["Enter the amount as a number."] });
  return run(ctx, parsed.data.issueId, () => prisma.$transaction((tx) => approveRepairAmount(tx, { spaceId: ctx.space.id, issueId: parsed.data.issueId, amountMinor, note: parsed.data.note }, { userId: ctx.user.id })).then(() => null));
}

const payoutSchema = issueOnly.extend({
  amount: text(20).min(1, "Enter the amount paid."),
  method: z.enum(["CASH", "BANK_TRANSFER", "UPI", "OTHER"]),
  reference: optionalText(120),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the day it was paid."),
  note: optionalText(500),
});

export async function recordRepairPayoutAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canPayRepairs);
  if (denied) return denied;
  const parsed = payoutSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const amountMinor = minor(parsed.data.amount, ctx.space.currency);
  if (amountMinor === null || amountMinor <= 0) return actionError("Enter the amount as a number, for example 1500.", { amount: ["Enter the amount as a number."] });
  const paidAt = startOfDay(parsed.data.paidOn, ctx.space.timezone);
  const result = await run(ctx, parsed.data.issueId, () => prisma.$transaction((tx) => recordRepairPayout(tx, { spaceId: ctx.space.id, issueId: parsed.data.issueId, amountMinor, method: parsed.data.method, reference: parsed.data.reference, paidAt, note: parsed.data.note }, { userId: ctx.user.id })).then(() => null));
  if (result.ok) {
    revalidatePath(`/s/${ctx.space.slug}/repairs/payouts`);
    revalidatePath(`/s/${ctx.space.slug}/finance`);
  }
  return result;
}

/** Parts for a repair go on the buy list, linked back to the repair. */
export async function requestRepairPartsAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canManageRepairs);
  if (denied) return denied;
  const parsed = issueOnly.extend({ name: text(120).min(1, "Say which part is needed."), quantity: z.number().int().min(1).max(100_000), note: optionalText(1000) }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await run(ctx, parsed.data.issueId, () => prisma.$transaction((tx) => createPurchase(tx, { spaceId: ctx.space.id, itemId: null, name: parsed.data.name, quantity: parsed.data.quantity, supplierId: null, unitCostMinor: null, link: null, note: parsed.data.note, repairIssueId: parsed.data.issueId }, { userId: ctx.user.id })).then(() => null));
  if (result.ok) revalidatePath(`/s/${ctx.space.slug}/purchases`);
  return result;
}
