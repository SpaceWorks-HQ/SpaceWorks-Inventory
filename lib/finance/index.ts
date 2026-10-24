/**
 * The finance ledger: one append-only entry per money movement, posted by
 * each source's own workflow in its transaction (see lib/finance/post.ts and
 * lib/finance/sources.ts), with reports and a consistency check. Visible
 * and manageable only by inventory managers (canViewFinance).
 */
export { postFinanceEntry, createManualEntry, reverseFinanceEntry, type PostInput, type ManualEntryInput } from "./post";
export { paymentMethod, paymentCategory, postPaymentReceived, postRefundProcessed, postRepairPayout, postPurchasePaid } from "./sources";
export { financeReport, financeTables, type FinanceReport } from "./report";
export { ledgerCheck } from "./consistency";
