import type { BorrowingStatus } from "@prisma/client";
import { BorrowingChip } from "@/components/inventory/StatusChips";
import { Card, CardHeader, DetailList } from "@/components/ui/display";

export type LoanFactsView = {
  borrower: { name: string; email: string } | null;
  standing: { status: BorrowingStatus; note: string | null; memberNumber: string | null } | null;
  facts: Array<{ label: string; value: string }>;
};

/** Who borrowed it, their standing, and the key dates. */
export function LoanFacts({ view }: { view: LoanFactsView }) {
  const items = [
    ...(view.borrower ? [{ label: "Member", value: <><span className="block">{view.borrower.name}</span>{view.borrower.name !== view.borrower.email ? <span className="block text-caption text-ink-muted">{view.borrower.email}</span> : null}</> }] : []),
    ...(view.standing ? [{ label: "Standing", value: <span className="flex flex-col items-start gap-1"><BorrowingChip status={view.standing.status} />{view.standing.note ? <span className="text-caption text-ink-muted">{view.standing.note}</span> : null}</span> }] : []),
    ...(view.standing?.memberNumber ? [{ label: "Member no.", value: view.standing.memberNumber }] : []),
    ...view.facts.map((fact) => ({ label: fact.label, value: fact.value })),
  ];
  return (
    <Card as="section" aria-label="Details">
      <CardHeader title="Details" />
      <DetailList items={items} />
    </Card>
  );
}
