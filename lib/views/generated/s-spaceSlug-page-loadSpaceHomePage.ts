// Generated from app/s/[spaceSlug]/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { requireSpace } from "@/lib/permissions";
import { canManageSpace, canViewStock } from "@/lib/roles";
import { memberHome, staffHome } from "@/lib/setup/home";
function greeting(name: string | null) {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hello, ${first}` : "Hello";
}
export async function loadSpaceHomePage({ params }: PageProps<"/s/[spaceSlug]">) {
const { spaceSlug } = await params;
const { space, user, membership } = await requireSpace(spaceSlug, "MEMBER");
const isStaff = canViewStock(membership);
const staff = isStaff ? await staffHome({ id: space.id, timezone: space.timezone }) : null;
const member = isStaff ? null : await memberHome(space.id, user.id);
const needsSetup = space.setupCompletedAt === null && canManageSpace(membership);
const slug = space.slug;
const timezone = space.timezone;
const lendingEnabled = space.lendingEnabled;
const title = greeting(user.name);
const description = space.tagline ?? `Welcome to ${space.name}.`;
return viewDto({ space, staff, member, needsSetup, slug, timezone, lendingEnabled, title, description } as const);
}
