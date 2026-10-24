// Generated from app/s/[spaceSlug]/catalogue/self-checkout/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { prisma } from "@/lib/db";
import { selfCheckoutCatalog } from "@/lib/desk/catalogue";
import { selfCheckoutOff } from "@/lib/desk/selfCheckoutOff";
import { checkBorrowingEligibility } from "@/lib/lending/access";
import { requireSpace } from "@/lib/permissions";

export async function loadSelfCheckoutPage({ params }: PageProps<"/s/[spaceSlug]/catalogue/self-checkout">) {
const { spaceSlug } = await params;
const { space, user } = await requireSpace(spaceSlug, "MEMBER");
const off = selfCheckoutOff(space);
const catalog = off ? null : await selfCheckoutCatalog(space.id);
const eligibility = off ? null : await checkBorrowingEligibility(prisma, { spaceId: space.id, userId: user.id, incomingUnits: 0 });
const blocked = eligibility && !eligibility.ok ? eligibility.error : null;
const slug = space.slug;
const minPhotos = space.minEvidencePhotos;
const items = catalog?.items ?? [];
return viewDto({ off, catalog, blocked, slug, minPhotos, items } as const);
}
