"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { revalidatePath } from "@/lib/frontend/cache";
import { domainFailure } from "@/lib/actionContext";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { actionError, RATE_LIMITED, validationError, type ActionResult } from "@/lib/actionResult";
import { readHandoverForm, withEvidencePhotos } from "@/lib/desk/photos";
import { parseMoneyToMinor } from "@/lib/format/money";
import { acceptRepairRequest, declineRepairRequest, findLinkRequest, recordRepairWork, MAX_REPAIR_PHOTOS } from "@/lib/repairs";

/**
 * An external technician's link (no account). The token is the only
 * credential: every action looks it up again, acts only on its one request
 * and is rate limited per address and per link.
 */

const CLOSED = "This link no longer works. The request may have been taken, withdrawn or closed.";
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

async function limited(token: string) {
  return isActionRateLimited("repairLink", `repair-link:${token}`);
}

export async function respondByLinkAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = z.object({ token: tokenSchema, accept: z.boolean(), reason: z.string().trim().max(500).optional().nullable() }).safeParse(input);
  if (!parsed.success) return actionError(CLOSED);
  if (await limited(parsed.data.token)) return actionError(RATE_LIMITED);
  const found = await findLinkRequest(parsed.data.token);
  if (!found || found.mode !== "respond") return actionError(CLOSED);
  const actor = { userId: null, technicianId: found.technicianId };
  try {
    await prisma.$transaction((tx) => (parsed.data.accept
      ? acceptRepairRequest(tx, { spaceId: found.space.id, requestId: found.request.id }, actor)
      : declineRepairRequest(tx, { spaceId: found.space.id, requestId: found.request.id, reason: parsed.data.reason || null }, actor)));
  } catch (error) {
    return domainFailure(error);
  }
  revalidatePath(`/s/${found.space.slug}/repairs`);
  return { ok: true, data: null };
}

const workSchema = z.object({
  token: tokenSchema,
  remarks: z.string().trim().max(2000).default(""),
  partsUsed: z.string().trim().max(1000).optional().nullable().transform((v) => v || null),
  amountAsked: z.string().trim().max(20).optional().nullable(),
  markFixed: z.boolean().default(false),
});

export async function saveWorkByLinkAction(formData: FormData): Promise<ActionResult<null>> {
  const { payload, photos } = readHandoverForm(formData);
  const parsed = workSchema.safeParse(payload);
  if (!parsed.success) {
    const tokenOk = tokenSchema.safeParse((payload as { token?: unknown } | null)?.token).success;
    return tokenOk ? validationError(parsed.error) : actionError(CLOSED);
  }
  if (await limited(parsed.data.token)) return actionError(RATE_LIMITED);
  const found = await findLinkRequest(parsed.data.token);
  if (!found || found.mode !== "work") return actionError(CLOSED);
  if (photos.length > MAX_REPAIR_PHOTOS) return actionError(`Attach at most ${MAX_REPAIR_PHOTOS} photos.`);
  const amountAskedMinor = parsed.data.amountAsked ? parseMoneyToMinor(parsed.data.amountAsked, found.space.currency) : null;
  if (parsed.data.amountAsked && amountAskedMinor === null) return actionError("Enter the amount as a number, for example 1500.", { amountAsked: ["Enter the amount as a number, for example 1500."] });
  try {
    await withEvidencePhotos(found.space.id, photos, (stored) => prisma.$transaction((tx) => recordRepairWork(tx, { spaceId: found.space.id, issueId: found.issue.id, remarks: parsed.data.remarks, partsUsed: parsed.data.partsUsed, amountAskedMinor, photos: stored, markFixed: parsed.data.markFixed }, { userId: null, technicianId: found.technicianId }), { timeout: 30_000 }));
  } catch (error) {
    return domainFailure(error);
  }
  revalidatePath(`/s/${found.space.slug}/repairs/${found.issue.id}`);
  return { ok: true, data: null };
}
