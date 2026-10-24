// Generated from app/s/[spaceSlug]/settings/roles/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { requireSpace } from "@/lib/permissions";
import { ROLE_MATRIX, roleDescription, roleLabel, SPACE_ROLES } from "@/lib/roles";

export async function loadRolesPage({ params }: PageProps<"/s/[spaceSlug]/settings/roles">) {
const { spaceSlug } = await params;
const { space } = await requireSpace(spaceSlug, "MANAGER");
const roles = [...SPACE_ROLES].reverse();
const matrix = ROLE_MATRIX.map((row) => ({ capability: row.capability, allowed: roles.map((role) => row.check({ role })) }));
const roleCards = SPACE_ROLES.map((role) => ({ role, label: roleLabel(role), description: roleDescription(role) }));
const slug = space.slug;
return viewDto({ roles, matrix, roleCards, slug } as const);
}
