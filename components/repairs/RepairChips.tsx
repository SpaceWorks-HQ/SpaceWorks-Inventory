import type { RepairRequestStatus, RepairSeverity, RepairStatus } from "@prisma/client";
import { Chip, type ChipTone } from "@/components/ui/display";
import { PAYOUT_STATE, REPAIR_STATUS, REQUEST_STATUS, SEVERITY_LABEL, type PayoutState } from "@/lib/repairs/labels";

/** Repair pills: always a word, colour only as support (docs/DESIGN.md §4.5). */

export function RepairStatusChip({ status }: { status: RepairStatus }) {
  const { label, tone } = REPAIR_STATUS[status];
  return <Chip tone={tone as ChipTone}>{label}</Chip>;
}

const SEVERITY_TONE: Record<RepairSeverity, ChipTone> = { LOW: "outline", MEDIUM: "neutral", HIGH: "warning", CRITICAL: "danger" };

export function SeverityChip({ severity }: { severity: RepairSeverity }) {
  return <Chip size="sm" tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</Chip>;
}

export function RequestChip({ status }: { status: RepairRequestStatus }) {
  const { label, tone } = REQUEST_STATUS[status];
  return <Chip size="sm" tone={tone as ChipTone}>{label}</Chip>;
}

export function PayoutChip({ state }: { state: PayoutState }) {
  const { label, tone } = PAYOUT_STATE[state];
  return <Chip size="sm" tone={tone as ChipTone}>{label}</Chip>;
}
