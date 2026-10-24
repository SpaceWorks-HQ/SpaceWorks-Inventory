import { z } from "zod";

/** Input schemas for the lending desk and borrowing actions (pure; unit tested). */

const id = z.string().trim().min(1, "That loan wasn't found.").max(64);
const count = z.number().int("Quantities must be whole numbers.").min(0, "Quantities can't be negative.").max(100_000);
const codes = z.array(z.string().trim().min(1).max(300)).max(300, "Scan at most 300 codes at once.");
const remarks = z.string().max(1000, "Keep remarks under 1,000 characters.").default("");

export const loanIdSchema = z.object({ loanId: id });

export const approveLoanSchema = z.object({ loanId: id, quantities: z.record(z.string().max(64), count) });

export const reasonSchema = z.object({
  loanId: id,
  reason: z.string().trim().max(500, "Keep the reason under 500 characters."),
});

export const rejectLoanSchema = reasonSchema.extend({ reason: z.string().trim().min(1, "Give the member a short reason.").max(500, "Keep the reason under 500 characters.") });

export const issueLoanSchema = z.object({ loanId: id, scannedCodes: codes, remarks });

export const returnLineSchema = z.object({
  lineId: id,
  returned: count,
  damaged: count,
  lost: count,
  locationId: z.string().max(64).nullable().optional(),
});

export const returnLoanSchema = z.object({
  loanId: id,
  scannedCodes: codes,
  remarks: z.string().trim().min(1, "Add a remark about the condition of the items.").max(1000, "Keep remarks under 1,000 characters."),
  lines: z.array(returnLineSchema).min(1, "Mark at least one item as returned, damaged or lost.").max(200),
});

export const setDueSchema = z.object({ loanId: id, dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a due date.") });

export const INCIDENT_RESOLUTIONS = ["REPAIRED", "REPLACED", "PAID", "FOUND", "WAIVED", "WRITTEN_OFF"] as const;

export const resolveIncidentSchema = z.object({
  incidentId: z.string().trim().min(1).max(64),
  resolution: z.enum(INCIDENT_RESOLUTIONS, { message: "Choose how it was resolved." }),
  note: z.string().trim().min(1, "Add a short note about how it was resolved.").max(1000, "Keep the note under 1,000 characters."),
  locationId: z.string().max(64).nullable().optional(),
});

export const requestLoanSchema = z.object({
  lines: z.array(z.object({ itemId: z.string().trim().min(1).max(64), quantity: z.number().int().min(1, "Quantities must be between 1 and 99.").max(99, "Quantities must be between 1 and 99.") }))
    .min(1, "Add at least one item to the request.")
    .max(20, "Request at most 20 different items at once."),
  purpose: z.string().trim().max(500, "Keep the purpose under 500 characters.").default(""),
  neededFrom: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a valid date.").default(""),
});

export const selfCheckoutSchema = z.object({
  scannedCodes: codes.min(1, "Scan the labels of what you're taking."),
  quantities: z.record(z.string().max(64), z.number().int().min(1).max(20)).default({}),
  remarks,
});

export const selfReturnSchema = z.object({
  loanId: id,
  scannedCodes: codes,
  remarks: z.string().trim().min(1, "Add a remark about the condition of the items.").max(1000, "Keep remarks under 1,000 characters."),
});

export const RESOLUTION_LABEL: Record<(typeof INCIDENT_RESOLUTIONS)[number], string> = {
  REPAIRED: "Repaired",
  REPLACED: "Replaced by the member",
  PAID: "Paid for",
  FOUND: "Found",
  WAIVED: "Waived",
  WRITTEN_OFF: "Written off",
};
