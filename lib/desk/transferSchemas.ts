import { z } from "zod";

/** Input schemas for the transfer desk actions (pure; shared by actions and tests). */

const id = z.string().trim().min(1).max(64);
const count = z.number({ message: "Quantities must be whole numbers." }).int("Quantities must be whole numbers.").min(0, "Quantities can't be negative.").max(100_000);
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => (value ? value : null));
const dateInput = z.string().trim().max(10).optional().transform((value) => value ?? "");

export const requestTransferSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("internal"), sourceLocationId: id, destLocationId: id }),
  z.object({ mode: z.literal("push"), destSpaceSlug: z.string().trim().min(1).max(64), sourceLocationId: id }),
  z.object({ mode: z.literal("pull"), sourceSpaceSlug: z.string().trim().min(1).max(64), destLocationId: id.optional().nullable() }),
]).and(z.object({
  lines: z.array(z.object({ itemId: id, quantity: count.min(1, "Quantities must be above zero.") })).min(1, "Add at least one item.").max(100, "Add at most 100 items."),
  reason: optionalText(500),
  neededBy: dateInput,
}));
export type RequestTransferInput = z.output<typeof requestTransferSchema>;

export const approveSchema = z.object({ transferId: id, quantities: z.record(id, count) });
export const reasonSchema = z.object({ transferId: id, reason: z.string().trim().min(1, "Give a short reason.").max(500) });
export const cancelSchema = z.object({ transferId: id, reason: optionalText(500) });

const remarks = z.string().trim().max(1000, "Keep remarks under 1,000 characters.").optional().transform((value) => value ?? "");
const codes = z.array(z.string().trim().min(1).max(300)).max(300, "Scan at most 300 labels at once.");

export const dispatchSchema = z.object({
  transferId: id,
  quantities: z.record(id, count),
  scannedCodes: codes,
  carrier: optionalText(80),
  trackingRef: optionalText(80),
  expectedAt: dateInput,
  remarks,
});

export const receiveSchema = z.object({
  transferId: id,
  destLocationId: id.nullable().optional(),
  lines: z.array(z.object({ lineId: id, received: count, damaged: count })).max(100),
  damagedAssetIds: z.array(id).max(300).default([]),
  scannedCodes: codes,
  remarks,
});

export const missingSchema = z.object({
  transferId: id,
  lines: z.array(z.object({ lineId: id, missing: count })).max(100),
  missingAssetIds: z.array(id).max(300).default([]),
  note: z.string().trim().min(1, "Note what happened to the missing units.").max(1000),
});

export const sendBackSchema = z.object({
  transferId: id,
  lines: z.array(z.object({ lineId: id, quantity: count })).max(100),
  assetIds: z.array(id).max(300).default([]),
  reason: z.string().trim().min(1, "Say why the units are going back.").max(500),
});

export const receiveReturnSchema = z.object({
  transferId: id,
  locationId: id.nullable().optional(),
  lines: z.array(z.object({ lineId: id, quantity: count })).max(100),
  scannedCodes: codes,
  remarks,
});

export const TRANSFER_FILTERS = ["open", "approval", "dispatch", "transit", "done", "all"] as const;
export type TransferFilter = (typeof TRANSFER_FILTERS)[number];
export const TRANSFER_DIRECTIONS = ["all", "in", "out"] as const;
export type TransferDirection = (typeof TRANSFER_DIRECTIONS)[number];
