import "server-only";

import type { z } from "zod";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import {
  approveTransfer, cancelTransfer, declareMissing, dispatchTransfer, receiveReturn, receiveTransfer, rejectTransfer, requestTransfer, sendBack,
} from "@/lib/transfers/workflow";
import { dateInputToDate } from "./dates";
import { withEvidencePhotos } from "./photos";
import { pickSourceLocation } from "./transferOptions";
import { assertTransferInSpace } from "./transfers";
import type {
  approveSchema, cancelSchema, dispatchSchema, missingSchema, reasonSchema, receiveReturnSchema, receiveSchema, RequestTransferInput, sendBackSchema,
} from "./transferSchemas";

/**
 * The transfer desk's services: each turns validated form input into one
 * workflow call in one transaction, acting as `space` (always the space of
 * the page the person is on). The workflow checks the side; these check the
 * transfer belongs to the space at all, so a foreign id reads as not found.
 */
export type DeskSpace = { id: string; timezone: string };
type Ctx = { space: DeskSpace; userId: string };

const TX = { timeout: 30_000, maxWait: 10_000 };

function validDate(value: string, timeZone: string, label: string) {
  const date = dateInputToDate(value, timeZone);
  if (date && Number.isNaN(date.getTime())) throw new DomainError(`Enter a valid ${label}.`, "invalid");
  return date;
}

export async function requestTransferStep(ctx: Ctx, input: RequestTransferInput) {
  const neededBy = validDate(input.neededBy, ctx.space.timezone, "needed-by date");
  const actor = { userId: ctx.userId };
  return prisma.$transaction(async (tx) => {
    const base = { lines: input.lines, reason: input.reason, neededBy, initiatedBySpaceId: ctx.space.id };
    if (input.mode === "internal") {
      return requestTransfer(tx, { ...base, sourceSpaceId: ctx.space.id, destSpaceId: ctx.space.id, sourceLocationId: input.sourceLocationId, destLocationId: input.destLocationId }, actor);
    }
    if (input.mode === "push") {
      const dest = await tx.space.findFirst({ where: { slug: input.destSpaceSlug, archivedAt: null, id: { not: ctx.space.id } }, select: { id: true } });
      if (!dest) throw new DomainError("That space wasn't found.", "not_found");
      return requestTransfer(tx, { ...base, sourceSpaceId: ctx.space.id, destSpaceId: dest.id, sourceLocationId: input.sourceLocationId, destLocationId: null }, actor);
    }
    const source = await tx.space.findFirst({ where: { slug: input.sourceSpaceSlug, archivedAt: null, id: { not: ctx.space.id }, shareStockWithSpaces: true }, select: { id: true } });
    if (!source) throw new DomainError("That space doesn't share its stock with other spaces.", "not_found");
    const sourceLocationId = await pickSourceLocation(tx, source.id, input.lines);
    return requestTransfer(tx, { ...base, sourceSpaceId: source.id, destSpaceId: ctx.space.id, sourceLocationId, destLocationId: input.destLocationId ?? null }, actor);
  }, TX);
}

export async function approveStep(ctx: Ctx, input: z.output<typeof approveSchema>) {
  await assertTransferInSpace(ctx.space.id, input.transferId);
  await prisma.$transaction((tx) => approveTransfer(tx, { transferId: input.transferId, actingSpaceId: ctx.space.id, quantities: input.quantities }, { userId: ctx.userId }), TX);
}

export async function rejectStep(ctx: Ctx, input: z.output<typeof reasonSchema>) {
  await assertTransferInSpace(ctx.space.id, input.transferId);
  await prisma.$transaction((tx) => rejectTransfer(tx, { transferId: input.transferId, actingSpaceId: ctx.space.id, reason: input.reason }, { userId: ctx.userId }), TX);
}

export async function cancelStep(ctx: Ctx, input: z.output<typeof cancelSchema>) {
  await assertTransferInSpace(ctx.space.id, input.transferId);
  await prisma.$transaction((tx) => cancelTransfer(tx, { transferId: input.transferId, actingSpaceId: ctx.space.id, reason: input.reason }, { userId: ctx.userId }), TX);
}

/** Pick, scan and send: photos are stored first and removed again if the dispatch is refused. */
export async function dispatchStep(ctx: Ctx, input: z.output<typeof dispatchSchema>, files: File[]) {
  await assertTransferInSpace(ctx.space.id, input.transferId);
  const expectedAt = validDate(input.expectedAt, ctx.space.timezone, "expected arrival date");
  await withEvidencePhotos(ctx.space.id, files, (photos) => prisma.$transaction((tx) => dispatchTransfer(tx, {
    transferId: input.transferId, actingSpaceId: ctx.space.id, quantities: input.quantities, scannedCodes: input.scannedCodes,
    carrier: input.carrier, trackingRef: input.trackingRef, expectedAt, evidence: { photos, remarks: input.remarks, scannedCodes: input.scannedCodes },
  }, { userId: ctx.userId }), TX));
}

export async function receiveStep(ctx: Ctx, input: z.output<typeof receiveSchema>, files: File[]) {
  await assertTransferInSpace(ctx.space.id, input.transferId);
  return withEvidencePhotos(ctx.space.id, files, (photos) => prisma.$transaction((tx) => receiveTransfer(tx, {
    transferId: input.transferId, actingSpaceId: ctx.space.id, destLocationId: input.destLocationId ?? null, lines: input.lines,
    damagedAssetIds: input.damagedAssetIds, scannedCodes: input.scannedCodes, evidence: { photos, remarks: input.remarks, scannedCodes: input.scannedCodes },
  }, { userId: ctx.userId }), TX));
}

export async function missingStep(ctx: Ctx, input: z.output<typeof missingSchema>) {
  await assertTransferInSpace(ctx.space.id, input.transferId);
  return prisma.$transaction((tx) => declareMissing(tx, { transferId: input.transferId, actingSpaceId: ctx.space.id, lines: input.lines, missingAssetIds: input.missingAssetIds, note: input.note }, { userId: ctx.userId }), TX);
}

export async function sendBackStep(ctx: Ctx, input: z.output<typeof sendBackSchema>) {
  await assertTransferInSpace(ctx.space.id, input.transferId);
  return prisma.$transaction((tx) => sendBack(tx, { transferId: input.transferId, actingSpaceId: ctx.space.id, lines: input.lines, assetIds: input.assetIds, reason: input.reason }, { userId: ctx.userId }), TX);
}

export async function receiveReturnStep(ctx: Ctx, input: z.output<typeof receiveReturnSchema>, files: File[]) {
  await assertTransferInSpace(ctx.space.id, input.transferId);
  return withEvidencePhotos(ctx.space.id, files, (photos) => prisma.$transaction((tx) => receiveReturn(tx, {
    transferId: input.transferId, actingSpaceId: ctx.space.id, locationId: input.locationId ?? null, lines: input.lines,
    scannedCodes: input.scannedCodes, evidence: { photos, remarks: input.remarks, scannedCodes: input.scannedCodes },
  }, { userId: ctx.userId }), TX));
}
