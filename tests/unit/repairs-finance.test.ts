import { describe, expect, it } from "vitest";

import { financialYearLabel, financialYearOf, financialYearRange, isPeriodGroup, periodKey, periodLabel } from "@/lib/finance/periods";
import { MANUAL_CATEGORIES, needsReference } from "@/lib/finance/labels";
import { paymentCategory, paymentMethod } from "@/lib/finance/sources";
import { effectiveRequestStatus, payoutState } from "@/lib/repairs/labels";
import { hashRepairLinkToken, isPlausibleRepairLinkToken, createRepairLinkToken, repairLinkUrl } from "@/lib/repairs/tokens";
import { whatsappNumber, telegramChatId, whatsappParameter } from "@/lib/repairs/channels";
import { normaliseSkills } from "@/lib/repairs/technicians";

describe("finance periods", () => {
  it("runs the financial year April to March", () => {
    expect(financialYearOf("2026-04-01")).toBe(2026);
    expect(financialYearOf("2026-03-31")).toBe(2025);
    expect(financialYearRange(2026)).toEqual({ fromDay: "2026-04-01", toDay: "2027-03-31" });
    expect(financialYearLabel(2026)).toBe("FY 2026-27");
    expect(financialYearLabel(2099)).toBe("FY 2099-00");
  });

  it("keys days into days, Monday weeks, months and financial years", () => {
    expect(periodKey("2026-10-24", "day")).toBe("2026-10-24");
    expect(periodKey("2026-10-25", "week")).toBe("2026-10-19");
    expect(periodKey("2026-10-19", "week")).toBe("2026-10-19");
    expect(periodKey("2026-10-24", "month")).toBe("2026-10");
    expect(periodKey("2027-01-02", "fy")).toBe("2026");
    expect(periodLabel("2026-10", "month")).toBe("Oct 2026");
    expect(periodLabel("2026-10-19", "week")).toBe("Week of 19 Oct 2026");
    expect(periodLabel("2026", "fy")).toBe("FY 2026-27");
    expect(isPeriodGroup("fy")).toBe(true);
    expect(isPeriodGroup("year")).toBe(false);
  });
});

describe("finance sources", () => {
  it("maps payment providers and offline methods", () => {
    expect(paymentMethod("RAZORPAY", "upi")).toBe("GATEWAY_RAZORPAY");
    expect(paymentMethod("STRIPE", null)).toBe("GATEWAY_STRIPE");
    expect(paymentMethod("OFFLINE", "bank_transfer")).toBe("BANK_TRANSFER");
    expect(paymentMethod("OFFLINE", "card")).toBe("OTHER");
  });

  it("files a payment under its one charge kind, or loan fees for a mix", () => {
    expect(paymentCategory(["DEPOSIT"])).toBe("DEPOSIT");
    expect(paymentCategory(["LATE_FEE", "LATE_FEE"])).toBe("LATE_FEE");
    expect(paymentCategory(["DEPOSIT", "RENTAL"])).toBe("LOAN_FEES");
  });

  it("asks a reference for everything but cash and keeps manual categories apart", () => {
    expect(needsReference("CASH")).toBe(false);
    expect(needsReference("UPI")).toBe(true);
    expect(MANUAL_CATEGORIES.IN).not.toContain("RENT");
    expect(MANUAL_CATEGORIES.OUT).toContain("UTILITIES");
  });
});

describe("repair rules", () => {
  it("tracks payout state against the approved amount", () => {
    expect(payoutState(null, 0)).toBe("NOTHING_DUE");
    expect(payoutState(1000, 0)).toBe("UNPAID");
    expect(payoutState(1000, 400)).toBe("PARTLY_PAID");
    expect(payoutState(1000, 1000)).toBe("PAID");
    expect(payoutState(0, 0)).toBe("PAID");
  });

  it("treats a waiting request as expired once its time is up", () => {
    const past = new Date(Date.now() - 1000);
    expect(effectiveRequestStatus({ status: "SENT", expiresAt: past })).toBe("EXPIRED");
    expect(effectiveRequestStatus({ status: "ACCEPTED", expiresAt: past })).toBe("ACCEPTED");
    expect(effectiveRequestStatus({ status: "SENT", expiresAt: new Date(Date.now() + 60_000) })).toBe("SENT");
  });

  it("makes unguessable link tokens and stores only a hash", () => {
    const { token, tokenHash } = createRepairLinkToken();
    expect(isPlausibleRepairLinkToken(token)).toBe(true);
    expect(tokenHash).toBe(hashRepairLinkToken(token));
    expect(tokenHash).not.toContain(token);
    expect(createRepairLinkToken().token).not.toBe(token);
    expect(isPlausibleRepairLinkToken("short")).toBe(false);
    expect(repairLinkUrl(token, "https://inv.example.org/")).toBe(`https://inv.example.org/r/${token}`);
  });

  it("checks contact formats and tidies skills", () => {
    expect(whatsappNumber.safeParse("+919876543210").success).toBe(true);
    expect(whatsappNumber.safeParse("98765").success).toBe(false);
    expect(telegramChatId.safeParse("-100123456789").success).toBe(true);
    expect(telegramChatId.safeParse("not an id").success).toBe(false);
    expect(whatsappParameter("Line one\n\nline   two")).toBe("Line one line two");
    expect(normaliseSkills([" Electrical", "electrical", "3D  Printers", ""])).toEqual(["electrical", "3d printers"]);
  });
});
