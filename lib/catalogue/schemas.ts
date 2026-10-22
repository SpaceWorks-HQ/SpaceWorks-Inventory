import { z } from "zod";

/** Shared, client-safe input schemas for the catalogue. Money is minor units. */

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const optionalId = z.string().trim().max(64).optional().transform((v) => v || null);
const optionalInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable().optional().transform((v) => v ?? null);
const optionalMoney = optionalInt(0, 100_000_000);

export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

export const itemSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  sku: z.string().trim().max(40).optional().transform((v) => v || null).refine((v) => v === null || SKU_PATTERN.test(v), "Use letters, digits, dots, dashes or underscores."),
  description: optionalText(2000),
  categoryId: optionalId,
  unitId: optionalId,
  supplierId: optionalId,
  tracking: z.enum(["QUANTITY", "SERIALIZED"]).default("QUANTITY"),
  barcode: optionalText(64),
  brand: optionalText(80),
  model: optionalText(80),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).default([]).transform((tags) => [...new Set(tags)]),
  unitCostMinor: z.number().int().min(0).max(100_000_000).default(0),
  reorderPoint: optionalInt(0, 1_000_000),
  reorderQuantity: optionalInt(1, 1_000_000),
  lendable: z.boolean().default(false),
  consumable: z.boolean().default(false),
  selfCheckout: z.boolean().default(false),
  requiresApproval: z.boolean().default(true),
  loanDays: optionalInt(1, 365),
  replacementMinor: optionalMoney,
  depositMinor: optionalMoney,
  rentalMode: z.enum(["FREE", "PER_DAY", "PER_WEEK", "FLAT"]).nullable().optional().transform((v) => v ?? null),
  rentalMinor: optionalMoney,
  lateFeePerDayMinor: optionalMoney,
  notes: optionalText(2000),
}).refine((v) => !(v.consumable && v.tracking === "SERIALIZED"), { message: "Serialized items are tracked one by one, so they can't be consumables.", path: ["consumable"] });

export type ItemInput = z.input<typeof itemSchema>;

export const locationKinds = ["SITE", "BUILDING", "FLOOR", "ROOM", "AREA", "CABINET", "SHELF", "BIN", "OTHER"] as const;

export const locationSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,23}$/, "Use up to 24 letters, digits, dots or dashes."),
  kind: z.enum(locationKinds).default("OTHER"),
  parentId: optionalId,
  description: optionalText(500),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(60),
  parentId: optionalId,
  description: optionalText(300),
  loanDays: optionalInt(1, 365),
  depositMinor: optionalMoney,
  rentalMode: z.enum(["FREE", "PER_DAY", "PER_WEEK", "FLAT"]).nullable().optional().transform((v) => v ?? null),
  rentalMinor: optionalMoney,
  lateFeePerDayMinor: optionalMoney,
});

export const unitSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(30),
  symbol: z.string().trim().min(1, "Enter a symbol.").max(10),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email address.")]).optional().transform((v) => v || null),
  phone: optionalText(32),
  website: z.union([z.literal(""), z.string().trim().url("Enter a full URL.")]).optional().transform((v) => v || null),
  notes: optionalText(1000),
});

export const assetBatchSchema = z.object({
  itemId: z.string().min(1).max(64),
  locationId: z.string().min(1, "Choose where the assets are.").max(64),
  serialNumbers: z.array(z.string().trim().max(80)).max(200).default([]),
  count: z.number().int().min(1).max(200).default(1),
  purchaseCostMinor: optionalMoney,
  purchasedAt: z.coerce.date().optional().nullable(),
  warrantyUntil: z.coerce.date().optional().nullable(),
  condition: z.enum(["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"]).default("GOOD"),
});

export const kitSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80),
  description: optionalText(500),
  lendable: z.boolean().default(true),
  lines: z.array(z.object({ itemId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(999) })).min(1, "Add at least one item.").max(50),
});
