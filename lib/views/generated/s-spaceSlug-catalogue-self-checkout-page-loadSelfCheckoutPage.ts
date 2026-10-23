// Generated from app/s/[spaceSlug]/catalogue/self-checkout/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { selfCheckoutCatalog } from "@/lib/desk/catalogue";
import { checkBorrowingEligibility } from "@/lib/lending/access";
import { requireSpace } from "@/lib/permissions";

export async function loadSelfCheckoutPage({ params }: PageProps<"/s/[spaceSlug]/catalogue/self-checkout">) {
const { spaceSlug } = await params;
const { space, user } = await requireSpace(spaceSlug, "MEMBER");
if (!space.lendingEnabled || !space.selfCheckoutEnabled) notFound();
const { items, paymentExcluded, unavailable } = await selfCheckoutCatalog(space.id);
const eligibility = await checkBorrowingEligibility(prisma, { spaceId: space.id, userId: user.id, incomingUnits: 0 });
const blocked = eligibility.ok ? null : eligibility.error;
const slug = space.slug;
const minPhotos = space.minEvidencePhotos;
return viewDto({ items, paymentExcluded, unavailable, blocked, slug, minPhotos } as const);
}
