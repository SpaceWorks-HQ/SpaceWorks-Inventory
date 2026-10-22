// Generated from app/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { isSetupOpen } from "@/lib/setup";
import { LAST_SPACE_COOKIE } from "@/lib/spaceCookie";
import { listUserSpaces } from "@/lib/spaces";
import { prisma } from "@/lib/db";

export async function loadHomeRedirect() {
if (await isSetupOpen()) redirect("/setup");
const user = await getCurrentUser();
if (!user) redirect("/login");
const spaces = await listUserSpaces(user.id);
const last = (await cookies()).get(LAST_SPACE_COOKIE)?.value;
const target = spaces.find((space) => space.slug === last) ?? spaces[0];
if (target) redirect(`/s/${target.slug}`);
const account = await prisma.user.findUnique({ where: { id: user.id }, select: { isInstanceAdmin: true } });
return viewDto({ user, account } as const);
}
