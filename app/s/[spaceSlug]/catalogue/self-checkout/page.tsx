import { notFound } from "next/navigation";
import { SelfCheckoutForm } from "@/components/borrow/SelfCheckoutForm";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { DetailLayout } from "@/components/ui/layouts";
import { prisma } from "@/lib/db";
import { selfCheckoutCatalog } from "@/lib/desk/catalogue";
import { checkBorrowingEligibility } from "@/lib/lending/access";
import { requireSpace } from "@/lib/permissions";

export default async function SelfCheckoutPage({ params }: PageProps<"/s/[spaceSlug]/catalogue/self-checkout">) {
  const { spaceSlug } = await params;
  const { space, user } = await requireSpace(spaceSlug, "MEMBER");
  if (!space.lendingEnabled || !space.selfCheckoutEnabled) notFound();
  const { items, paymentExcluded, unavailable } = await selfCheckoutCatalog(space.id);
  const eligibility = await checkBorrowingEligibility(prisma, { spaceId: space.id, userId: user.id, incomingUnits: 0 });
  const blocked = eligibility.ok ? null : eligibility.error;
  const slug = space.slug;
  const minPhotos = space.minEvidencePhotos;

  return (
    <DetailLayout
      back={{ href: `/s/${slug}/catalogue`, label: "Back to the catalogue" }}
      header={<PageHeader title="Self-checkout" description="Borrow items marked for self-checkout without waiting for the desk. Staff see what you took." />}
    >
      {items.length === 0 ? <EmptyState>{paymentExcluded > 0 ? "These items have a deposit or fee and pay later is switched off. Borrow them at the desk." : "No items are set up for self-checkout. Request them from the catalogue instead."}</EmptyState> : <SelfCheckoutForm slug={slug} items={items} unavailable={unavailable} minPhotos={minPhotos} blocked={blocked} />}
    </DetailLayout>
  );
}
