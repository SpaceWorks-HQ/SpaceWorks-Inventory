import { z } from "zod";
import { newPasswordSchema } from "@/lib/passwordPolicy";
import { isValidSpaceSlug } from "@/lib/slug";
import { isValidTimeZone } from "@/lib/timeZone";
import { isValidCurrency } from "@/lib/format/money";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
export const nameSchema = z.string().trim().min(1, "Enter a name.").max(80, "Keep the name under 80 characters.");
export { newPasswordSchema };

export const spaceSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isValidSpaceSlug, "Use 1–60 lowercase letters, numbers and dashes (not a reserved word).");

export const timeZoneSchema = z.string().trim().refine(isValidTimeZone, "Choose a valid time zone.");
export const currencySchema = z.string().trim().toUpperCase().refine(isValidCurrency, "Use a three-letter currency code such as INR.");

export const roleSchema = z.enum(["MANAGER", "STAFF", "MEMBER", "TECHNICIAN"]);
export const idSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
