// Generated from app/account/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { prisma } from "@/lib/db";
import { remainingRecoveryCodes } from "@/lib/mfa";
import { requireAuth } from "@/lib/permissions";
import { listUserSpaces } from "@/lib/spaces";

export async function loadAccountPage() {
const sessionUser = await requireAuth();
const [user, spaces, remaining] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: sessionUser.id },
      select: { name: true, email: true, phone: true, passwordHash: true, mfaEnabledAt: true },
    }),
    listUserSpaces(sessionUser.id),
    remainingRecoveryCodes(sessionUser.id),
  ]);
const hasPassword = Boolean(user.passwordHash);
return viewDto({ user, spaces, remaining, hasPassword } as const);
}
