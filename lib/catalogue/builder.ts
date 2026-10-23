import "server-only";

import { z } from "zod";
import type { Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { DomainError, notFound } from "@/lib/domainError";
import { newQrCode } from "./qr";

/**
 * Quick builder: "a building with N rooms, each with N shelves" in one
 * transaction, with generated codes (B1, B1-R1, B1-R1-S1).
 */
export const MAX_BUILDER_LOCATIONS = 500;

export const builderSchema = z.object({
  buildingName: z.string().trim().min(1, "Enter a name for the building.").max(80),
  buildingCode: z.string().trim().toUpperCase().max(12).optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[A-Z0-9][A-Z0-9._]{0,11}$/.test(v), "Use up to 12 letters, digits, dots or underscores."),
  rooms: z.number().int().min(1, "Add at least one room.").max(50, "Add at most 50 rooms at a time."),
  shelvesPerRoom: z.number().int().min(0).max(50, "Add at most 50 shelves per room."),
  parentId: z.string().trim().max(64).optional().transform((v) => v || null),
}).refine((v) => v.rooms * (v.shelvesPerRoom + 1) < MAX_BUILDER_LOCATIONS, { message: `Create at most ${MAX_BUILDER_LOCATIONS} locations at a time.`, path: ["shelvesPerRoom"] });

export type BuilderInput = z.input<typeof builderSchema>;
export type PlannedLocation = { code: string; name: string; kind: "BUILDING" | "ROOM" | "SHELF"; parentCode: string | null };

/** The next free "B<n>" code given the codes already used in the space. */
export function nextBuildingCode(existing: string[]): string {
  let highest = 0;
  for (const code of existing) {
    const match = code.toUpperCase().match(/^B(\d{1,6})$/);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `B${highest + 1}`;
}

/** Parents always come before their children, so the list can be created in order. */
export function planHierarchy(input: { buildingName: string; buildingCode: string; rooms: number; shelvesPerRoom: number }): PlannedLocation[] {
  const plan: PlannedLocation[] = [{ code: input.buildingCode, name: input.buildingName, kind: "BUILDING", parentCode: null }];
  for (let room = 1; room <= input.rooms; room += 1) {
    const roomCode = `${input.buildingCode}-R${room}`;
    plan.push({ code: roomCode, name: `Room ${room}`, kind: "ROOM", parentCode: input.buildingCode });
    for (let shelf = 1; shelf <= input.shelvesPerRoom; shelf += 1) {
      plan.push({ code: `${roomCode}-S${shelf}`, name: `Shelf ${shelf}`, kind: "SHELF", parentCode: roomCode });
    }
  }
  return plan;
}

export async function buildHierarchy(tx: Tx, spaceId: string, raw: BuilderInput, actor: { userId: string | null }) {
  const input = builderSchema.parse(raw);
  if (input.parentId) {
    const parent = await tx.location.findFirst({ where: { id: input.parentId, spaceId }, select: { archivedAt: true } });
    if (!parent) notFound("parent location");
    if (parent.archivedAt) throw new DomainError("Choose a parent that isn't archived.", "invalid");
  }
  const buildingCode = input.buildingCode ?? nextBuildingCode((await tx.location.findMany({ where: { spaceId, code: { startsWith: "B" } }, select: { code: true } })).map((row) => row.code));
  const plan = planHierarchy({ ...input, buildingCode });
  const clashes = await tx.location.findMany({ where: { spaceId, code: { in: plan.map((row) => row.code) } }, select: { code: true }, orderBy: { code: "asc" }, take: 3 });
  if (clashes.length > 0) throw new DomainError(`Code ${clashes.map((row) => row.code).join(", ")} is already used. Choose another building code.`, "conflict");
  const ids = new Map<string, string>();
  for (const [index, row] of plan.entries()) {
    const parentId = row.parentCode ? ids.get(row.parentCode)! : input.parentId;
    const created = await tx.location.create({ data: { spaceId, parentId, kind: row.kind, name: row.name, code: row.code, qrCode: newQrCode("location"), sortOrder: index }, select: { id: true } });
    ids.set(row.code, created.id);
  }
  const buildingId = ids.get(buildingCode)!;
  await recordAuditEvent({ client: tx, action: "location.built", spaceId, actorId: actor.userId, targetType: "Location", targetId: buildingId, metadata: { code: buildingCode, count: plan.length } });
  return { buildingId, buildingCode, count: plan.length };
}
