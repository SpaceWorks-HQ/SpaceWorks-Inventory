// Generated from app/admin/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { prisma } from "@/lib/db";
import { getOutboxHealth } from "@/lib/outbox";
import { requireSuperAdminMfa } from "@/lib/permissions";
import { storageConfigured } from "@/lib/storage";
import { isRedisConfigured } from "@/lib/redis";

export async function loadAdminOverviewPage() {
await requireSuperAdminMfa();
const [users, spaces, outbox] = await Promise.all([
    prisma.user.count(),
    prisma.space.count({ where: { archivedAt: null } }),
    getOutboxHealth(),
  ]);
const redisConfigured = isRedisConfigured();
const filesConfigured = storageConfigured();
return viewDto({ users, spaces, outbox, redisConfigured, filesConfigured } as const);
}
