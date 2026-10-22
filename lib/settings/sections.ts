import { z } from "zod";
import type { SpaceRole } from "@prisma/client";
import { isValidTimeZone } from "@/lib/timeZone";
import { isValidCurrency } from "@/lib/format/money";

/**
 * Every space setting, grouped into sections. Each section names the role
 * that may change it: OWNER/ADMIN are the space managers, MANAGER is the
 * inventory manager. Pure and client-safe so forms share the schemas.
 * Money is integer minor units; forms convert from major units.
 */

const bool = z.boolean();
const days = (max: number) => z.number().int().min(0).max(max);
const money = z.number().int().min(0).max(100_000_000);

export const SETTINGS_SECTIONS = {
  general: {
    title: "General",
    minRole: "ADMIN",
    schema: z.object({
      name: z.string().trim().min(2, "Enter a space name.").max(80),
      tagline: z.string().trim().max(140).transform((v) => v || null),
      address: z.string().trim().max(300).transform((v) => v || null),
      contactEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email address.")]).transform((v) => v || null),
      timezone: z.string().trim().refine(isValidTimeZone, "Choose a valid time zone."),
      currency: z.string().trim().toUpperCase().refine(isValidCurrency, "Use a three-letter currency code such as INR."),
      tagPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,6}$/, "Use 1–6 letters or digits."),
    }),
  },
  lending: {
    title: "Lending policy",
    minRole: "ADMIN",
    schema: z.object({
      lendingEnabled: bool,
      publicCatalogue: bool,
      selfCheckoutEnabled: bool,
      defaultLoanDays: z.number().int().min(1).max(365),
      maxLoanDays: z.number().int().min(1).max(365),
      maxActiveLoans: days(100),
      maxItemsOnLoan: days(1000),
      maxRenewals: days(20),
      renewalDays: z.number().int().min(1).max(180),
      reminderDaysBefore: days(30),
      overdueReminderDays: z.number().int().min(1).max(30),
    }).refine((v) => v.defaultLoanDays <= v.maxLoanDays, { message: "The default loan can't be longer than the longest loan.", path: ["defaultLoanDays"] }),
  },
  eligibility: {
    title: "Member eligibility",
    minRole: "ADMIN",
    schema: z.object({
      selfJoin: bool,
      requireVerifiedEmail: bool,
      requireMemberNumber: bool,
      restrictWhenOverdue: bool,
      restrictOnIncident: bool,
    }),
  },
  evidence: {
    title: "Evidence rules",
    minRole: "ADMIN",
    schema: z.object({
      minEvidencePhotos: z.number().int().min(1, "At least one photo is always required.").max(3),
      requireContainer: bool,
      requireIssueRemarks: bool,
    }),
  },
  fees: {
    title: "Fees and deposits",
    minRole: "ADMIN",
    schema: z.object({
      depositMode: z.enum(["NONE", "FIXED", "PER_ITEM"]),
      depositMinor: money,
      rentalMode: z.enum(["FREE", "PER_DAY", "PER_WEEK", "FLAT"]),
      rentalMinor: money,
      lateFeePerDayMinor: money,
      lateFeeCapMinor: money,
      lateFeeGraceDays: days(60),
      damageChargeMode: z.enum(["NONE", "REPLACEMENT_COST", "FIXED"]),
      damageChargeMinor: money,
      paymentBeforeIssue: bool,
      payLaterEnabled: bool,
    }),
  },
  notifications: {
    title: "Notifications",
    minRole: "ADMIN",
    schema: z.object({
      notifyStaffOnRequest: bool,
      notifyLowStock: bool,
      overdueEscalateDays: days(60),
    }),
  },
  network: {
    title: "Transfers between spaces",
    minRole: "ADMIN",
    schema: z.object({
      acceptsTransfers: bool,
      shareStockWithSpaces: bool,
    }),
  },
  inventory: {
    title: "Inventory",
    minRole: "MANAGER",
    schema: z.object({
      internalTransferApproval: bool,
      labelSize: z.enum(["SMALL", "MEDIUM", "LARGE"]),
      labelShowName: bool,
      labelShowLocation: bool,
      defaultReorderPoint: z.number().int().min(0).max(1_000_000).nullable(),
      countVarianceThreshold: z.number().int().min(0).max(1_000_000).nullable(),
    }),
  },
} as const satisfies Record<string, { title: string; minRole: SpaceRole; schema: z.ZodType }>;

export type SettingsSection = keyof typeof SETTINGS_SECTIONS;
export type SectionValues<S extends SettingsSection> = z.infer<(typeof SETTINGS_SECTIONS)[S]["schema"]>;

export const SETTINGS_SECTION_KEYS = Object.keys(SETTINGS_SECTIONS) as SettingsSection[];

export function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === "string" && (SETTINGS_SECTION_KEYS as string[]).includes(value);
}

/** Field names whose values differ, for the audit trail (values themselves are not logged). */
export function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null));
}
