// Generated from app/s/[spaceSlug]/settings/payments/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { getPaymentConfigView } from "@/lib/payments/config";
import { requireSpace } from "@/lib/permissions";

export async function loadPaymentSettingsPage({ params }: PageProps<"/s/[spaceSlug]/settings/payments">) {
const { spaceSlug } = await params;
const { space } = await requireSpace(spaceSlug, "ADMIN");
const config = await getPaymentConfigView(space.id);
const slug = space.slug;
const currency = space.currency;
return viewDto({ config, slug, currency } as const);
}
