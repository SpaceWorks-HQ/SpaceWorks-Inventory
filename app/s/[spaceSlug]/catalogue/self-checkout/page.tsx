import Link from "next/link";
import { SelfCheckoutForm } from "@/components/borrow/SelfCheckoutForm";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { DetailLayout } from "@/components/ui/layouts";
import { prisma } from "@/lib/db";
import { selfCheckoutCatalog } from "@/lib/desk/catalogue";
import { selfCheckoutOff } from "@/lib/desk/selfCheckoutOff";
import { checkBorrowingEligibility } from "@/lib/lending/access";
import { requireSpace } from "@/lib/permissions";

export default async function SelfCheckoutPage({ params }: PageProps<"/s/[spaceSlug]/catalogue/self-checkout">) {
  const { spaceSlug } = await params;
  // Unknown and foreign spaces are still not-found (requireSpace); a member of
  // this space is told why self-checkout isn't available instead.
  const { space, user } = await requireSpace(spaceSlug, "MEMBER");
  const off = selfCheckoutOff(space);
  const catalog = off ? null : await selfCheckoutCatalog(space.id);
  const eligibility = off ? null : await checkBorrowingEligibility(prisma, { spaceId: space.id, userId: user.id, incomingUnits: 0 });
  const blocked = eligibility && !eligibility.ok ? eligibility.error : null;
  const slug = space.slug;
  const minPhotos = space.minEvidencePhotos;
  const items = catalog?.items ?? [];

  return (
    <DetailLayout
      back={{ href: `/s/${slug}/catalogue`, label: "Back to the catalogue" }}
      header={<PageHeader title="Self-checkout" description="Borrow items marked for self-checkout without waiting for the desk. Staff see what you took." />}
    >
      {off ? (
        <EmptyState
          title={off.title}
          action={off.catalogue ? <Link href={`/s/${slug}/catalogue`} className={buttonClasses({ variant: "primary" })}>Request from the catalogue</Link> : undefined}
        >
          {off.body}
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>{(catalog?.paymentExcluded ?? 0) > 0 ? "These items have a deposit or fee and pay later is switched off. Borrow them at the desk." : "No items are set up for self-checkout. Request them from the catalogue instead."}</EmptyState>
      ) : (
        <SelfCheckoutForm slug={slug} items={items} unavailable={catalog!.unavailable} minPhotos={minPhotos} blocked={blocked} />
      )}
    </DetailLayout>
  );
}
