// Generated from app/s/[spaceSlug]/my-loans/[loanId]/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { notFound } from "next/navigation";
import { evidenceFor } from "@/lib/desk/evidence";
import { memberLoanDetail } from "@/lib/desk/memberLoanDetail";
import { formatDayTime } from "@/lib/format/datetime";
import { getLoanPaymentView } from "@/lib/payments/view";
import { requireSpace } from "@/lib/permissions";
import { doneFor } from "@/lib/desk/stepper";

export async function loadMyLoanPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/my-loans/[loanId]">) {
const { spaceSlug, loanId } = await params;
const query = await searchParams;
const { space, user } = await requireSpace(spaceSlug, "MEMBER");
const loan = await memberLoanDetail(space.id, loanId, user.id, space);
if (!loan) notFound();
const slug = space.slug;
const done = doneFor(query.done, ["self-checkout", "self-return"], loan.status);
const [evidenceRows, payment] = await Promise.all([evidenceFor(slug, { spaceId: space.id, loanId: loan.id }), getLoanPaymentView(space.id, loan.id)]);
const evidence = evidenceRows.map((row) => ({ ...row, whenLabel: formatDayTime(row.createdAt, space.timezone) }));
const minPhotos = space.minEvidencePhotos;
return viewDto({ loan, slug, done, payment, evidence, minPhotos } as const);
}
