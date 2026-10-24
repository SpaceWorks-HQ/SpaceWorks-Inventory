// Generated from app/s/[spaceSlug]/catalogue/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { prisma } from "@/lib/db";
import { borrowCatalogue } from "@/lib/desk/catalogue";
import { dateInputValue } from "@/lib/desk/dates";
import { checkBorrowingEligibility } from "@/lib/lending/access";
import { requireSpace } from "@/lib/permissions";

export async function loadCataloguePage({ params }: PageProps<"/s/[spaceSlug]/catalogue">) {
const { spaceSlug } = await params;
const { space, user } = await requireSpace(spaceSlug, "MEMBER");
const catalogue = await borrowCatalogue(space);
const eligibility = await checkBorrowingEligibility(prisma, { spaceId: space.id, userId: user.id, incomingUnits: 0 });
const blocked = eligibility.ok ? null : eligibility.error;
const slug = space.slug;
const items = catalogue.items;
const kits = catalogue.kits;
const categories = catalogue.categories;
const minDate = dateInputValue(new Date(), space.timezone);
const selfCheckout = space.lendingEnabled && space.selfCheckoutEnabled;
const lendingOff = !space.lendingEnabled;
return viewDto({ blocked, slug, items, kits, categories, minDate, selfCheckout, lendingOff } as const);
}
