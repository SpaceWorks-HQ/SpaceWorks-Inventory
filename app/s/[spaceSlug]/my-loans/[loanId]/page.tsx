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
import { evidenceFor } from "@/lib/desk/evidence";
import { memberLoanDetail } from "@/lib/desk/memberLoanDetail";
import { formatDayTime } from "@/lib/format/datetime";
import { getLoanPaymentView } from "@/lib/payments/view";
import { requireSpace } from "@/lib/permissions";

export default async function MyLoanPage({ params }: PageProps<"/s/[spaceSlug]/my-loans/[loanId]">) {
  const { spaceSlug, loanId } = await params;
  const { space, user } = await requireSpace(spaceSlug, "MEMBER");
  const loan = await memberLoanDetail(space.id, loanId, user.id, space);
  if (!loan) notFound();
  const slug = space.slug;
  const [evidenceRows, payment] = await Promise.all([evidenceFor(slug, { spaceId: space.id, loanId: loan.id }), getLoanPaymentView(space.id, loan.id)]);
  const evidence = evidenceRows.map((row) => ({ ...row, whenLabel: formatDayTime(row.createdAt, space.timezone) }));
  const minPhotos = space.minEvidencePhotos;

  return (
    <DetailLayout
      back={{ href: `/s/${slug}/my-loans`, label: "Back to my loans" }}
      header={<PageHeader kicker="Your loan" title={<span className="flex flex-wrap items-center gap-3">{loan.reference}<LoanStatusChip status={loan.status} overdue={loan.overdue} /></span>} description={loan.facts.summary} />}
      aside={
        <div className="flex flex-col gap-6">
          <LoanFacts view={loan.facts.view} />
          <MemberLoanActions slug={slug} loanId={loan.id} canRenew={loan.canRenew} renewHint={loan.renewHint} renewReason={loan.renewReason} canCancel={loan.canCancel} />
          {payment ? <LoanPaymentPanel summary={payment} spaceSlug={slug} loanId={loan.id} viewer="borrower" /> : null}
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {loan.nextStep ? <Callout tone={loan.overdue ? "danger" : "info"}>{loan.nextStep}</Callout> : null}
        {loan.closedNote ? <Callout tone="info" title="Not approved">{loan.closedNote}</Callout> : null}
        {loan.selfReturn ? <SelfReturnFlow slug={slug} loanId={loan.id} lines={loan.returnLines} minPhotos={minPhotos} /> : null}
        <LoanLinesTable lines={loan.lines} showLocation={false} />
        <IncidentList slug={slug} incidents={loan.incidents} canResolve={false} locations={[]} />
        {evidence.length ? <EvidenceGallery items={evidence} /> : null}
      </div>
    </DetailLayout>
  );
}
