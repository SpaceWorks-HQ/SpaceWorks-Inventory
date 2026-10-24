import "server-only";

import type { Membership, Space } from "@prisma/client";
import { countUnreadNotifications } from "@/lib/notifications";
import { navForMember, type ResolvedNavGroup } from "@/lib/nav";
import type { SessionUser } from "@/lib/permissions";
import { roleLabel } from "@/lib/roles";
import { listUserSpaces, type UserSpace } from "@/lib/spaces";
import { prisma } from "@/lib/db";

export type ShellData = {
  user: { name: string | null; email: string; image: string | null };
  space: { slug: string; name: string; roleLabel: string };
  spaces: UserSpace[];
  nav: ResolvedNavGroup[];
  unreadNotifications: number;
  isSuperAdmin: boolean;
};

export async function getShellData(user: SessionUser, space: Space, membership: Membership): Promise<ShellData> {
  const [spaces, unread, account] = await Promise.all([
    listUserSpaces(user.id),
    countUnreadNotifications(user.id, space.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { isInstanceAdmin: true, email: true } }),
  ]);
  const superEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  return {
    user: { name: user.name, email: user.email, image: user.image },
    space: { slug: space.slug, name: space.name, roleLabel: roleLabel(membership.role) },
    spaces,
    nav: navForMember(space.slug, { role: membership.role, space }),
    unreadNotifications: unread,
    isSuperAdmin: Boolean(account?.isInstanceAdmin || (superEmail && account?.email === superEmail)),
  };
}
