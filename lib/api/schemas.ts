import { z } from "zod";

/** Request bodies for /api/v1 writes (pure). Quantities are whole units, money minor units. */

const id = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "Use a valid id.");
const note = z.string().trim().max(500).optional().nullable().transform((v) => v || null);
const date = z.iso.datetime({ offset: true, message: "Use an ISO 8601 date-time." }).optional().nullable().transform((v) => (v ? new Date(v) : null));

export const ADJUSTMENT_REASONS = ["FOUND", "CORRECTION", "CONSUMED", "LOST", "DAMAGED", "EXPIRED", "STOLEN", "DONATED", "RETURNED_TO_SUPPLIER", "OTHER"] as const;

export const adjustmentSchema = z.object({
  itemId: id,
  locationId: id,
  delta: z.number().int().min(-1_000_000).max(1_000_000).refine((v) => v !== 0, "delta can't be zero."),
  reason: z.enum(ADJUSTMENT_REASONS),
  note,
}).strict();

export const receiptSchema = z.object({
  itemId: id,
  locationId: id,
  quantity: z.number().int().min(1).max(1_000_000),
  unitCostMinor: z.number().int().min(0).max(100_000_000).optional().nullable().transform((v) => v ?? null),
  reason: z.enum(["RECEIVED", "FOUND", "DONATED"]).default("RECEIVED"),
  note,
}).strict();

const lines = z.array(z.object({ itemId: id, quantity: z.number().int().min(1) }).strict()).min(1, "Add at least one line.").max(100);

export const loanRequestSchema = z.object({
  memberId: id,
  lines: lines.max(20),
  purpose: z.string().trim().max(300).optional().nullable().transform((v) => v || null),
  neededFrom: date,
}).strict();

const quantities = z.record(id, z.number().int().min(0)).optional().nullable().transform((v) => v ?? null);

export const approveSchema = z.object({ quantities }).strict();
export const rejectSchema = z.object({ reason: z.string().trim().min(1, "Give a short reason.").max(500) }).strict();
export const cancelSchema = z.object({ reason: z.string().trim().max(500).optional().nullable().transform((v) => v || null) }).strict();

export const transferRequestSchema = z.object({
  /** Slug of the receiving space; omit (or use this space's slug) for a move between locations. */
  destinationSpace: z.string().trim().min(1).max(64).optional().nullable().transform((v) => v || null),
  sourceLocationId: id,
  destinationLocationId: id.optional().nullable().transform((v) => v ?? null),
  lines,
  reason: note,
  neededBy: date,
}).strict();

export const LOAN_ACTIONS = ["approve", "reject", "cancel"] as const;
export type LoanApiAction = (typeof LOAN_ACTIONS)[number];
export const TRANSFER_ACTIONS = ["approve", "reject", "cancel"] as const;
export type TransferApiAction = (typeof TRANSFER_ACTIONS)[number];
