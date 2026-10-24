import { z } from "zod";

/** Input schemas for the cycle-count Server Actions (pure, unit tested). */

const id = z.string().trim().min(1).max(64);
export const COUNT_QUANTITY_MAX = 1_000_000;
const optionalId = z.string().trim().max(64).nullish().transform((value) => value || null);
const counted = z.number({ message: "Enter a whole number of zero or more." }).int("Enter a whole number of zero or more.").min(0, "Enter a whole number of zero or more.").max(COUNT_QUANTITY_MAX, "That number is too large.");

export const startCountSchema = z.object({
  name: z.string().trim().min(1, "Name the count, e.g. \"Electronics lab, October\".").max(120),
  locationId: optionalId,
  categoryId: optionalId,
  blind: z.boolean(),
});

export const countIdSchema = z.object({ countId: id });

export const recordCountSchema = z.object({
  countId: id,
  lineId: id,
  counted,
  note: z.string().trim().max(300).nullish().transform((value) => value || null),
});

export const addCountLineSchema = z.object({ countId: id, itemId: z.string().trim().min(1, "Choose an item.").max(64), locationId: z.string().trim().min(1, "Choose where you found it.").max(64), counted });

export const scanCountSchema = z.object({ countId: id, code: z.string().trim().min(1, "Scan an asset tag.").max(300), locationId: z.string().trim().min(1, "Choose the shelf you're counting.").max(64) });

export const refreshLineSchema = z.object({ countId: id, lineId: id });

export const scheduleSchema = z.object({
  name: z.string().trim().min(1, "Name the schedule.").max(120),
  locationId: optionalId,
  categoryId: optionalId,
  everyDays: z.number({ message: "Repeat every 1 to 365 days." }).int("Repeat every 1 to 365 days.").min(1, "Repeat every 1 to 365 days.").max(365, "Repeat every 1 to 365 days."),
  blind: z.boolean(),
  /** "YYYY-MM-DD" in the space time zone, or blank for today. */
  firstRunDate: z.string().trim().max(10).regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a start date.").default(""),
});

export const scheduleActiveSchema = z.object({ scheduleId: id, active: z.boolean() });

export type StartCountInput = z.infer<typeof startCountSchema>;
export type ScheduleInput = z.infer<typeof scheduleSchema>;
