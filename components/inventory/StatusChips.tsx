import type { AssetStatus, BorrowingStatus, CountStatus, LoanStatus, PurchaseStatus, TransferStatus } from "@prisma/client";
import { Chip, type ChipTone } from "@/components/ui/display";
import { LOAN_STATUS_LABEL } from "@/lib/lending/policy";
import { TRANSFER_STATUS_LABEL } from "@/lib/transfers/policy";

/** Status pills for every workflow: always a word, colour only as support (docs/DESIGN.md §4.5). */

const LOAN_TONE: Record<LoanStatus, ChipTone> = {
  REQUESTED: "info", APPROVED: "accent", REJECTED: "outline", CANCELLED: "outline", ISSUED: "highlight", PARTIALLY_RETURNED: "warning", RETURNED: "success", CLOSED_WITH_ISSUE: "danger",
};

export function LoanStatusChip({ status, overdue = false }: { status: LoanStatus; overdue?: boolean }) {
  if (overdue) return <Chip tone="danger">Overdue</Chip>;
  return <Chip tone={LOAN_TONE[status]}>{LOAN_STATUS_LABEL[status]}</Chip>;
}

const TRANSFER_TONE: Record<TransferStatus, ChipTone> = {
  REQUESTED: "info", APPROVED: "accent", REJECTED: "outline", DISPATCHED: "highlight", PARTIALLY_RECEIVED: "warning", RECEIVED: "success", CANCELLED: "outline", RETURNING: "warning", RETURNED: "neutral",
};

export function TransferStatusChip({ status }: { status: TransferStatus }) {
  return <Chip tone={TRANSFER_TONE[status]}>{TRANSFER_STATUS_LABEL[status]}</Chip>;
}

const ASSET: Record<AssetStatus, [string, ChipTone]> = {
  AVAILABLE: ["Available", "success"], RESERVED: ["Held", "info"], ON_LOAN: ["On loan", "highlight"], IN_TRANSIT: ["In transit", "warning"], MAINTENANCE: ["Under repair", "warning"], LOST: ["Lost", "danger"], RETIRED: ["Retired", "outline"],
};

export function AssetStatusChip({ status }: { status: AssetStatus }) {
  const [label, tone] = ASSET[status];
  return <Chip tone={tone}>{label}</Chip>;
}

const COUNT: Record<CountStatus, [string, ChipTone]> = {
  IN_PROGRESS: ["Counting", "info"], SUBMITTED: ["Waiting to post", "warning"], POSTED: ["Posted", "success"], CANCELLED: ["Cancelled", "outline"],
};

export function CountStatusChip({ status }: { status: CountStatus }) {
  const [label, tone] = COUNT[status];
  return <Chip tone={tone}>{label}</Chip>;
}

const PURCHASE: Record<PurchaseStatus, [string, ChipTone]> = {
  REQUESTED: ["Requested", "info"], APPROVED: ["Approved", "accent"], ORDERED: ["Ordered", "highlight"], RECEIVED: ["Received", "success"], CANCELLED: ["Cancelled", "outline"],
};

export function PurchaseStatusChip({ status }: { status: PurchaseStatus }) {
  const [label, tone] = PURCHASE[status];
  return <Chip tone={tone}>{label}</Chip>;
}

const STANDING: Record<BorrowingStatus, [string, ChipTone]> = { GOOD: ["Can borrow", "success"], RESTRICTED: ["Restricted", "warning"], SUSPENDED: ["Suspended", "danger"] };

export function BorrowingChip({ status }: { status: BorrowingStatus }) {
  const [label, tone] = STANDING[status];
  return <Chip tone={tone}>{label}</Chip>;
}

/** "3 available", "Out of stock", "2 left" with the right tone. */
export function AvailabilityChip({ available, reorderPoint = null, unit = null }: { available: number; reorderPoint?: number | null; unit?: string | null }) {
  if (available <= 0) return <Chip tone="danger">Out of stock</Chip>;
  const low = reorderPoint !== null && available <= reorderPoint;
  return <Chip tone={low ? "warning" : "success"}>{`${available}${unit ? ` ${unit}` : ""} ${low ? "left" : "available"}`}</Chip>;
}
