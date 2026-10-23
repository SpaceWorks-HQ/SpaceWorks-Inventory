import { notFound } from "next/navigation";
import { EvidenceGallery } from "@/components/desk/EvidenceGallery";
import { Timeline } from "@/components/desk/Timeline";
import { LoanStatusChip } from "@/components/inventory/StatusChips";
import { ApproveCard } from "@/components/loans/ApproveCard";
import { IncidentList } from "@/components/loans/IncidentList";
import { IssueFlow } from "@/components/loans/IssueFlow";
import { LoanFacts } from "@/components/loans/LoanFacts";
import { LoanLinesTable } from "@/components/loans/LoanLinesTable";
import { LoanSideActions } from "@/components/loans/LoanSideActions";
import { ReturnFlow } from "@/components/loans/ReturnFlow";
import { LoanPaymentPanel } from "@/components/payments/LoanPaymentPanel";
import { Callout, PageHeader } from "@/components/ui/display";
import { DetailLayout } from "@/components/ui/layouts";
import { loanRef } from "@/lib/catalogue/references";
import { prisma } from "@/lib/db";
import { dateInputValue } from "@/lib/desk/dates";
import { evidenceFor } from "@/lib/desk/evidence";
import { issueScanCatalog, loanDetail, loanTimeline } from "@/lib/desk/loansDetail";
import { incidentViews, lineRows, loanFacts } from "@/lib/desk/loansView";
import { locationOptions } from "@/lib/desk/locations";
import { formatDayTime, formatRelativeTime } from "@/lib/format/datetime";
import { availabilityFor, availabilityOf } from "@/lib/inventory/availability";
import { checkBorrowingEligibility } from "@/lib/lending/access";
import { isOverdue } from "@/lib/lending/policy";
import { renewalRefusal } from "@/lib/lending/renewalPolicy";
import { renewalFacts } from "@/lib/lending/renewalReadiness";
import { issuePaymentReady } from "@/lib/payments/readiness";
import { getLoanPaymentView } from "@/lib/payments/view";
import { canApproveLoans, canIssueLoans, canResolveIncidents, requireSpace } from "@/lib/permissions";

export default async function LoanPage({ params }: PageProps<"/s/[spaceSlug]/loans/[loanId]">) {
  const { spaceSlug, loanId } = await params;
  const { space, membership } = await requireSpace(spaceSlug, "STAFF");
  const loan = await loanDetail(space.id, loanId);
  if (!loan) notFound();
  const tz = space.timezone;
  const now = new Date();
  const slug = space.slug;
  const reference = loanRef(loan.number);
  const status = loan.status;
  const overdue = isOverdue(loan, now);
  const approver = canApproveLoans(membership);
  const desk = canIssueLoans(membership);
  const resolver = canResolveIncidents(membership);
  const active = status === "ISSUED" || status === "PARTIALLY_RETURNED";
  const [timelineRows, evidenceRows, payment, locations] = await Promise.all([
    loanTimeline(space.id, loan.id, loan.incidents.map((i) => i.id)),
    evidenceFor(slug, { spaceId: space.id, loanId: loan.id }),
    getLoanPaymentView(space.id, loan.id),
    locationOptions(space.id),
  ]);
  const units = loan.lines.reduce((sum, line) => sum + (status === "REQUESTED" ? line.requested : line.approved), 0);
  const eligibility = status === "REQUESTED" || status === "APPROVED" ? await checkBorrowingEligibility(prisma, { spaceId: space.id, userId: loan.borrower.id, incomingUnits: units }) : null;
  const eligibilityProblem = eligibility && !eligibility.ok ? eligibility.error : null;
  const availability = status === "REQUESTED" ? await availabilityFor(space.id, loan.lines.map((line) => line.itemId)) : null;
  const approveLines = availability ? loan.lines.map((line) => ({ id: line.id, name: line.itemName, sku: line.sku, requested: line.requested, available: availabilityOf(availability, line.itemId).available })) : [];
  const catalog = status === "APPROVED" ? await issueScanCatalog(space.id, [...new Set(loan.lines.filter((l) => l.tracking === "SERIALIZED").map((l) => l.itemId))]) : null;
  const issueLines = loan.lines.map((line) => ({ id: line.id, itemId: line.itemId, name: line.itemName, tracking: line.tracking, itemCode: line.itemCode, units: line.approved }));
  const returnLines = loan.lines.filter((line) => line.outstanding > 0).map((line) => ({
    id: line.id, itemId: line.itemId, name: line.itemName, tracking: line.tracking, itemCode: line.itemCode, units: line.outstanding, assetCode: line.assetCode,
    label: line.assetTag ? `${line.itemName} · ${line.assetTag}` : line.itemName, outstanding: line.outstanding, serialized: Boolean(line.assetCode), locationId: line.locationId,
  }));
  const container = loan.container ? { code: loan.container.qrCode, label: loan.container.name ? `Container ${loan.container.code} · ${loan.container.name}` : `Container ${loan.container.code}` } : null;
  const lines = lineRows(loan);
  const incidents = incidentViews(loan, tz);
  const facts = loanFacts(loan, tz, now, { showBorrower: true });
  const timeline = timelineRows.map((row) => ({ id: row.id, title: row.title, detail: row.detail, actorName: row.actorName, whenLabel: formatRelativeTime(row.createdAt, tz, now) }));
  const evidence = evidenceRows.map((row) => ({ ...row, whenLabel: formatDayTime(row.createdAt, tz) }));
  const renewalsLeft = Math.max(0, space.maxRenewals - loan.renewalCount);
  const renewal = active ? renewalRefusal({ ...await renewalFacts(prisma, space.id, loan.borrower.id, loan.lines.filter((line) => line.outstanding > 0).map((line) => line.itemId)), status, maxRenewals: space.maxRenewals, renewalCount: loan.renewalCount, byBorrower: false }) : null;
  const sideActions = {
    canRenew: desk && active && !renewal,
    renewReason: desk && active ? renewal?.reason ?? null : null,
    renewHint: `Adds ${space.renewalDays} days. ${renewalsLeft} ${renewalsLeft === 1 ? "renewal" : "renewals"} left.`,
    canSetDue: desk && (status === "APPROVED" || active),
    dueValue: dateInputValue(loan.dueAt, tz),
    canCancel: approver && status === "APPROVED",
  };
  const minPhotos = space.minEvidencePhotos;
  const requireRemarks = space.requireIssueRemarks;
  const requireContainer = space.requireContainer;
  const paymentReady = payment ? issuePaymentReady(space.paymentBeforeIssue, payment.charges, payment.payments) : !space.paymentBeforeIssue;
  const returnKey = `${loan.id}:${returnLines.map((line) => `${line.id}:${line.outstanding}`).join(",")}`;
  const closedNote = status === "REJECTED" ? loan.rejectReason : status === "CANCELLED" ? loan.staffNote : null;

  return (
    <DetailLayout
      back={{ href: `/s/${slug}/loans`, label: "Back to loans" }}
      header={<PageHeader kicker="Loan" title={<span className="flex flex-wrap items-center gap-3">{reference}<LoanStatusChip status={status} overdue={overdue} /></span>} description={`${loan.borrower.name} · ${facts.summary}`} />}
      aside={
        <div className="flex flex-col gap-6">
          <LoanFacts view={facts.view} />
          <LoanSideActions slug={slug} loanId={loan.id} {...sideActions} />
          {payment ? <LoanPaymentPanel summary={payment} spaceSlug={slug} loanId={loan.id} viewer="staff" /> : null}
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {closedNote ? <Callout tone="info" title={status === "REJECTED" ? "Rejected" : "Cancelled"}>{closedNote}</Callout> : null}
        {status === "REQUESTED" && approver ? <ApproveCard slug={slug} loanId={loan.id} lines={approveLines} eligibility={eligibilityProblem} /> : null}
        {status === "APPROVED" && desk && catalog ? (
          <IssueFlow slug={slug} loanId={loan.id} lines={issueLines} assets={catalog.assets} containers={catalog.containers} unavailable={catalog.unavailable} paymentReady={paymentReady} minPhotos={minPhotos} requireRemarks={requireRemarks} requireContainer={requireContainer} blocked={eligibilityProblem} />
        ) : null}
        {active && desk ? <ReturnFlow key={returnKey} slug={slug} loanId={loan.id} lines={returnLines} container={container} locations={locations} minPhotos={minPhotos} /> : null}
        <LoanLinesTable lines={lines} />
        <IncidentList slug={slug} incidents={incidents} canResolve={resolver} locations={locations} />
        <EvidenceGallery items={evidence} />
        <Timeline entries={timeline} />
      </div>
    </DetailLayout>
  );
}
