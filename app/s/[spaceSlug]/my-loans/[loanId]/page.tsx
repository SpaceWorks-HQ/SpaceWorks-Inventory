import { notFound } from "next/navigation";
import { EvidenceGallery } from "@/components/desk/EvidenceGallery";
import { LoanStatusChip } from "@/components/inventory/StatusChips";
import { IncidentList } from "@/components/loans/IncidentList";
import { LoanFacts } from "@/components/loans/LoanFacts";
import { LoanLinesTable } from "@/components/loans/LoanLinesTable";
import { MemberLoanActions } from "@/components/loans/MemberLoanActions";
import { SelfReturnFlow } from "@/components/loans/SelfReturnFlow";
import { LoanPaymentPanel } from "@/components/payments/LoanPaymentPanel";
import { Callout, PageHeader } from "@/components/ui/display";
import { DetailLayout } from "@/components/ui/layouts";
import { loanRef } from "@/lib/catalogue/references";
import { evidenceFor } from "@/lib/desk/evidence";
import { loanDetail } from "@/lib/desk/loansDetail";
import { incidentViews, lineRows, loanFacts } from "@/lib/desk/loansView";
import { formatDayLong, formatDayTime } from "@/lib/format/datetime";
import { isOverdue } from "@/lib/lending/policy";
import { getLoanPaymentView } from "@/lib/payments/view";
import { requireSpace } from "@/lib/permissions";

const NEXT_STEP: Record<string, string> = {
  REQUESTED: "Waiting for the desk to approve it. You'll get a notification.",
  APPROVED: "Ready to collect. Come to the desk; staff scan and photograph the items as they hand them over.",
  ISSUED: "Bring everything back to the desk by the due date.",
  PARTIALLY_RETURNED: "Some items are back. Bring the rest to the desk by the due date.",
};

export default async function MyLoanPage({ params }: PageProps<"/s/[spaceSlug]/my-loans/[loanId]">) {
  const { spaceSlug, loanId } = await params;
  const { space, user } = await requireSpace(spaceSlug, "MEMBER");
  const loan = await loanDetail(space.id, loanId, { borrowerId: user.id });
  if (!loan) notFound();
  const tz = space.timezone;
  const now = new Date();
  const slug = space.slug;
  const reference = loanRef(loan.number);
  const status = loan.status;
  const overdue = isOverdue(loan, now);
  const active = status === "ISSUED" || status === "PARTIALLY_RETURNED";
  const [evidenceRows, payment] = await Promise.all([evidenceFor(slug, { spaceId: space.id, loanId: loan.id }), getLoanPaymentView(space.id, loan.id)]);
  const evidence = evidenceRows.map((row) => ({ ...row, whenLabel: formatDayTime(row.createdAt, tz) }));
  const lines = lineRows(loan);
  const incidents = incidentViews(loan, tz);
  const facts = loanFacts(loan, tz, now, { showBorrower: false });
  const renewalsLeft = Math.max(0, space.maxRenewals - loan.renewalCount);
  const canRenew = active && renewalsLeft > 0;
  const renewHint = `Adds ${space.renewalDays} days if nobody is waiting for these items. ${renewalsLeft} ${renewalsLeft === 1 ? "renewal" : "renewals"} left.`;
  const canCancel = status === "REQUESTED" || status === "APPROVED";
  const selfReturn = active && loan.selfCheckout && space.selfCheckoutEnabled;
  const returnLines = loan.lines.filter((line) => line.outstanding > 0).map((line) => ({
    id: line.id, itemId: line.itemId, name: line.itemName, tracking: line.tracking, itemCode: line.itemCode, units: line.outstanding, assetCode: line.assetCode,
    label: line.assetTag ? `${line.itemName} · ${line.assetTag}` : line.itemName,
  }));
  const minPhotos = space.minEvidencePhotos;
  const nextStep = overdue ? `This loan was due ${formatDayLong(loan.dueAt, tz, now)}. Please bring it back as soon as you can.` : NEXT_STEP[status] ?? null;
  const closedNote = status === "REJECTED" ? loan.rejectReason : null;

  return (
    <DetailLayout
      back={{ href: `/s/${slug}/my-loans`, label: "Back to my loans" }}
      header={<PageHeader kicker="Your loan" title={<span className="flex flex-wrap items-center gap-3">{reference}<LoanStatusChip status={status} overdue={overdue} /></span>} description={facts.summary} />}
      aside={
        <div className="flex flex-col gap-6">
          <LoanFacts view={facts.view} />
          <MemberLoanActions slug={slug} loanId={loan.id} canRenew={canRenew} renewHint={renewHint} canCancel={canCancel} />
          {payment ? <LoanPaymentPanel summary={payment} spaceSlug={slug} loanId={loan.id} viewer="borrower" /> : null}
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {nextStep ? <Callout tone={overdue ? "danger" : "info"}>{nextStep}</Callout> : null}
        {closedNote ? <Callout tone="info" title="Not approved">{closedNote}</Callout> : null}
        {selfReturn ? <SelfReturnFlow slug={slug} loanId={loan.id} lines={returnLines} minPhotos={minPhotos} /> : null}
        <LoanLinesTable lines={lines} showLocation={false} />
        <IncidentList slug={slug} incidents={incidents} canResolve={false} locations={[]} />
        {evidence.length ? <EvidenceGallery items={evidence} /> : null}
      </div>
    </DetailLayout>
  );
}
