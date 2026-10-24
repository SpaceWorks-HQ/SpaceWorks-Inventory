import "server-only";

import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { recordAuditEvent } from "@/lib/audit";
import type { Tx } from "@/lib/db";
import { startCount } from "./start";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function saveCountSchedule(tx: Tx, input: { spaceId: string; scheduleId: string | null; name: string; locationId: string | null; categoryId: string | null; everyDays: number; blind: boolean; active: boolean; firstRunAt: Date | null; actorId: string | null }) {
  if (!input.name.trim()) throw new DomainError("Name the schedule.", "invalid");
  if (!Number.isSafeInteger(input.everyDays) || input.everyDays < 1 || input.everyDays > 365) throw new DomainError("Repeat every 1 to 365 days.", "invalid");
  if (input.locationId && !(await tx.location.findFirst({ where: { id: input.locationId, spaceId: input.spaceId }, select: { id: true } }))) throw new DomainError("That location wasn't found.", "not_found");
  if (input.categoryId && !(await tx.category.findFirst({ where: { id: input.categoryId, spaceId: input.spaceId }, select: { id: true } }))) throw new DomainError("That category wasn't found.", "not_found");
  const data = { name: input.name.trim().slice(0, 120), locationId: input.locationId, categoryId: input.categoryId, everyDays: input.everyDays, blind: input.blind, active: input.active, nextRunAt: input.firstRunAt ?? new Date() };
  let id: string;
  let fields = Object.keys(data);
  if (input.scheduleId) {
    await tx.$queryRaw`SELECT "id" FROM "CountSchedule" WHERE "id" = ${input.scheduleId} AND "spaceId" = ${input.spaceId} FOR UPDATE`;
    const before = await tx.countSchedule.findFirst({ where: { id: input.scheduleId, spaceId: input.spaceId } });
    if (!before) throw new DomainError("That schedule wasn't found.", "not_found");
    fields = (Object.keys(data) as Array<keyof typeof data>).filter((key) => key === "nextRunAt" ? before[key].getTime() !== data[key].getTime() : before[key] !== data[key]);
    const updated = await tx.countSchedule.updateMany({ where: { id: input.scheduleId, spaceId: input.spaceId }, data });
    if (updated.count !== 1) throw new DomainError("That schedule wasn't found.", "not_found");
    id = input.scheduleId;
  } else {
    id = (await tx.countSchedule.create({ data: { ...data, spaceId: input.spaceId } })).id;
  }
  if (fields.length) await recordAuditEvent({ client: tx, action: input.scheduleId ? "count.schedule_updated" : "count.schedule_created", spaceId: input.spaceId, actorId: input.actorId, targetType: "CountSchedule", targetId: id, metadata: { fields: fields.join(",") } });
  return id;
}

/** Beat job: open a count for each due schedule (one count even after missed runs) and move the next run on. */
export async function runCountSchedules(now = new Date()) {
  const due = await prisma.countSchedule.findMany({ where: { active: true, nextRunAt: { lte: now }, space: { archivedAt: null } }, take: 100 });
  let started = 0;
  for (const schedule of due) {
    await prisma.$transaction(async (tx) => {
      let next = schedule.nextRunAt.getTime();
      while (next <= now.getTime()) next += schedule.everyDays * DAY_MS;
      const claim = await tx.countSchedule.updateMany({ where: { id: schedule.id, nextRunAt: schedule.nextRunAt }, data: { nextRunAt: new Date(next) } });
      if (claim.count !== 1) return;
      try {
        await startCount(tx, { spaceId: schedule.spaceId, name: `${schedule.name} (scheduled)`, locationId: schedule.locationId, categoryId: schedule.categoryId, blind: schedule.blind, actorId: null });
        started += 1;
      } catch (error) {
        // An open count of the same scope is fine: the schedule simply waits for the next run.
        if (!(error instanceof DomainError)) throw error;
      }
    });
  }
  return { started };
}
