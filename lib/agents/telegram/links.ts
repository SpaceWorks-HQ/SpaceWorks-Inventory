import "server-only";
import path from "node:path";
import { JsonFileStore } from "@spaceworks-hq/agents/stores";
import { createTelegramAccountLinks, createTelegramLinkState } from "@spaceworks-hq/agents/telegram";
import type { Actor } from "@spaceworks-hq/agents/helper";
import { prisma } from "@/lib/db";
import { inventoryTelegramConfig } from "./config";

/** A Telegram identity never supplies its own host role or space membership. */
export async function lookupInventoryTelegramActor(actorId: string, tenantId: string): Promise<Actor | null> {
  const membership = await prisma.membership.findUnique({ where: { userId_spaceId: { userId: actorId, spaceId: tenantId } },
    include: { user: { select: { disabledAt: true, name: true } }, space: { select: { archivedAt: true } } } });
  if (!membership || membership.status !== "ACTIVE" || membership.user.disabledAt || membership.space.archivedAt || membership.role === "TECHNICIAN") return null;
  const role = membership.role.toLowerCase() as Actor["role"];
  if (!["member", "staff", "manager"].includes(role)) return null;
  return { id: actorId, tenantId, role, name: membership.user.name ?? "Inventory member" };
}

export async function inventoryTelegramLinks(root = process.cwd(), namespace?: string) {
  const config = await inventoryTelegramConfig(root, namespace);
  return createTelegramAccountLinks({ namespace: config.namespace,
    store: new JsonFileStore(path.join(config.directory, "links"), createTelegramLinkState()), lookupActor: lookupInventoryTelegramActor });
}
