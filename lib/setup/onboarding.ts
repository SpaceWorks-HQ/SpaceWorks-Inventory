import "server-only";

import { prisma, type Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { createLocation } from "@/lib/catalogue/locations";
import { saveCategory, saveUnit } from "@/lib/catalogue/taxonomy";
import { DomainError } from "@/lib/domainError";
import { locationPlanProblem, type PlannedLocation } from "./wizard";

type Actor = { userId: string | null };

/**
 * Create the locations from the setup quick builder in one transaction.
 * Rows are created in order, so parents exist before their children.
 */
export async function createLocationPlan(tx: Tx, spaceId: string, rows: PlannedLocation[], actor: Actor) {
  const problem = locationPlanProblem(rows);
  if (problem) throw new DomainError(problem, "invalid");
  const ids = new Map<string, string>();
  for (const row of rows) {
    const location = await createLocation(tx, spaceId, {
      name: row.name,
      code: row.code,
      kind: row.kind,
      parentId: row.parentKey ? ids.get(row.parentKey) : undefined,
    }, actor);
    ids.set(row.key, location.id);
  }
  return { created: rows.length };
}

/** Add categories by name, skipping ones the space already has (names compare case-insensitively). */
export async function addCategories(tx: Tx, spaceId: string, names: string[], actor: Actor) {
  const wanted: string[] = [];
  for (const name of names.map((n) => n.trim()).filter(Boolean)) {
    if (!wanted.some((kept) => kept.toLowerCase() === name.toLowerCase())) wanted.push(name);
  }
  if (wanted.length === 0) throw new DomainError("Pick or type at least one category.", "invalid");
  if (wanted.length > 50) throw new DomainError("Add at most 50 categories at once.", "invalid");
  const existing = await tx.category.findMany({ where: { spaceId }, select: { name: true } });
  const have = new Set(existing.map((category) => category.name.toLowerCase()));
  let created = 0;
  for (const name of wanted) {
    if (have.has(name.toLowerCase())) continue;
    await saveCategory(tx, spaceId, null, { name }, actor);
    created += 1;
  }
  return { created };
}

export async function addUnit(tx: Tx, spaceId: string, input: { name: string; symbol: string }, actor: Actor) {
  return saveUnit(tx, spaceId, null, input, actor);
}

/** Mark setup done (or re-done). The wizard stays re-enterable afterwards. */
export async function completeSetup(tx: Tx, spaceId: string, actor: Actor) {
  const space = await tx.space.findUniqueOrThrow({ where: { id: spaceId }, select: { setupCompletedAt: true } });
  const now = new Date();
  await tx.space.update({ where: { id: spaceId }, data: { setupCompletedAt: now } });
  await recordAuditEvent({ client: tx, action: "space.setup_completed", spaceId, actorId: actor.userId, targetType: "Space", targetId: spaceId, metadata: { again: space.setupCompletedAt !== null } });
  return now;
}

/** What the wizard shows as already done on each step. */
export async function setupProgress(spaceId: string) {
  const [locations, categories, units, members, invitations, items] = await Promise.all([
    prisma.location.count({ where: { spaceId, archivedAt: null } }),
    prisma.category.findMany({ where: { spaceId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    prisma.unit.findMany({ where: { spaceId }, select: { id: true, name: true, symbol: true }, orderBy: { name: "asc" }, take: 100 }),
    prisma.membership.count({ where: { spaceId, status: "ACTIVE" } }),
    prisma.invitation.count({ where: { spaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.item.count({ where: { spaceId, archivedAt: null } }),
  ]);
  return { locations, categories, units, members, invitations, items };
}
