// Generated from app/c/[spaceSlug]/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/permissions";
import { checkRateLimitById, getClientIpFromHeaders } from "@/lib/rateLimit";
import { publicCatalogue } from "@/lib/setup/publicCatalogue";
function pick(value: string | string[] | undefined) {
  return typeof value === "string" ? value.slice(0, 64) : null;
}
const chipClass = "inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors duration-[200ms] ease-yy";
export async function loadPublicCataloguePage({ params, searchParams }: PageProps<"/c/[spaceSlug]">) {
const { spaceSlug } = await params;
const query = await searchParams;
if (!(await checkRateLimitById("publicCatalogue", `ip:${getClientIpFromHeaders(await headers())}`))) notFound();
const catalogue = await publicCatalogue(spaceSlug);
if (!catalogue) notFound();
const user = await getCurrentUser();
const membership = user ? await prisma.membership.findUnique({ where: { userId_spaceId: { userId: user.id, spaceId: catalogue.space.id } }, select: { status: true } }) : null;
const isMember = membership?.status === "ACTIVE";
const category = pick(query.category);
const highlighted = pick(query.item);
const items = catalogue.items.filter((item) => !category || item.categoryId === category);
const space = catalogue.space;
const base = `/c/${encodeURIComponent(space.slug)}`;
const loginHref = `/login?callbackUrl=${encodeURIComponent(base)}`;
return viewDto({ catalogue, user, isMember, category, highlighted, items, space, base, loginHref } as const);
}
