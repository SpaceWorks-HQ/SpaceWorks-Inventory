import type { Metadata } from "next";
import { AuthFrame } from "@/components/chrome/AuthFrame";
import { RepairLinkActions } from "@/components/repairs/RepairLinkActions";
import { PayoutChip, SeverityChip } from "@/components/repairs/RepairChips";
import { Callout, Card, DetailList } from "@/components/ui/display";
import { formatMoney } from "@/lib/format/money";
import { findLinkRequest, linkView } from "@/lib/repairs";

export const metadata: Metadata = { title: "Repair request", referrer: "no-referrer", robots: { index: false, follow: false } };

/** An external technician's repair link: the one job, nothing else from the space. */
export default async function RepairLinkPage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const found = await findLinkRequest(token);
  const view = found ? await linkView(found) : null;
  if (!view) {
    return (
      <AuthFrame centered title="This link no longer works." description="The request may have been taken by someone else, withdrawn, closed or expired.">
        <Callout tone="info">If you still want the job, contact the space that sent it.</Callout>
      </AuthFrame>
    );
  }
  const photoUrl = (id: string) => `/api/r/${token}/photos/${id}`;
  return (
    <AuthFrame title={`${view.reference} for ${view.spaceName}`} description={view.mode === "respond" ? `Hello ${view.technicianName}. Can you take this repair?` : view.mode === "work" ? `Hello ${view.technicianName}. This repair is yours.` : "Thank you. The space is checking the fix."}>
      <div className="flex flex-col gap-5">
        <Card>
          <p className="text-label text-ink">{view.title}</p>
          <p className="mt-2 whitespace-pre-line text-body-ui text-ink-secondary">{view.description}</p>
          <DetailList
            className="mt-4"
            items={[
              { label: "Item", value: `${view.item}${view.assetTag ? ` (${view.assetTag})` : ""}` },
              { label: "Urgency", value: <SeverityChip severity={view.severity} /> },
              ...(view.location ? [{ label: "Where", value: view.location }] : []),
              ...(view.amountAskedMinor !== null ? [{ label: "You asked", value: formatMoney(view.amountAskedMinor, view.currency) }, { label: "Payment", value: <PayoutChip state={view.payout} /> }] : []),
            ]}
          />
          {view.photos.length ? (
            <ul className="mt-4 grid grid-cols-2 gap-3" aria-label="Photos">
              {view.photos.map((photo) => (
                <li key={photo.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- private photo behind the link token */}
                  <img src={photoUrl(photo.id)} alt={photo.stage === "FIX" ? "Photo of the fix" : "Photo of the problem"} className="aspect-[4/3] w-full rounded-lg border border-line object-cover" loading="lazy" />
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
        {view.mode === "waiting" ? <Callout tone="success">You marked it fixed. You&apos;ll get an email when it is paid.</Callout> : <RepairLinkActions token={token} mode={view.mode} currency={view.currency} remarks={view.fixRemarks ?? ""} partsUsed={view.partsUsed ?? ""} askedMinor={view.amountAskedMinor} />}
        <p className="text-caption text-ink-muted">This link is only for you. Don&apos;t forward it.</p>
      </div>
    </AuthFrame>
  );
}
