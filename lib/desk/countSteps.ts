import "server-only";

import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { addCountLine, cancelCount, postCount, recordCountedQuantity, refreshCountLine, reopenCount, saveCountSchedule, scanCountAsset, startCount, submitCount } from "@/lib/counts";
import { dateInputToDate } from "./dates";
import type { ScheduleInput, StartCountInput } from "./countSchemas";

/**
 * The cycle-count steps behind app/actions/counts.ts: each runs one domain
 * function of lib/counts in its own transaction, always scoped to the space
 * the caller is a member of (the domain re-checks the space on every row).
 */

type Who = { spaceId: string; actorId: string };

export function startCountStep(who: Who, input: StartCountInput) {
  return prisma.$transaction((tx) => startCount(tx, { spaceId: who.spaceId, name: input.name, locationId: input.locationId, categoryId: input.categoryId, blind: input.blind, actorId: who.actorId }));
}

export function recordCountStep(who: Who, input: { countId: string; lineId: string; counted: number; note: string | null }) {
  return prisma.$transaction((tx) => recordCountedQuantity(tx, { spaceId: who.spaceId, countId: input.countId, lineId: input.lineId, counted: input.counted, note: input.note, actorId: who.actorId }));
}

export function addCountLineStep(who: Who, input: { countId: string; itemId: string; locationId: string; counted: number }) {
  return prisma.$transaction((tx) => addCountLine(tx, { spaceId: who.spaceId, countId: input.countId, itemId: input.itemId, locationId: input.locationId, counted: input.counted, actorId: who.actorId }));
}

/** Scan one asset tag at the shelf being counted; returns its label for the confirmation. */
export async function scanCountStep(who: Who, input: { countId: string; code: string; locationId: string }) {
  const resolved = await prisma.$transaction((tx) => scanCountAsset(tx, { spaceId: who.spaceId, countId: input.countId, code: input.code, locationId: input.locationId, actorId: who.actorId }));
  return { label: resolved.label };
}

export function refreshCountLineStep(who: Who, input: { countId: string; lineId: string }) {
  return prisma.$transaction((tx) => refreshCountLine(tx, { spaceId: who.spaceId, countId: input.countId, lineId: input.lineId }));
}

export type CountTransition = "submit" | "reopen" | "post" | "cancel";

export async function countTransitionStep(who: Who, step: CountTransition, countId: string) {
  const input = { spaceId: who.spaceId, countId, actorId: who.actorId };
  await prisma.$transaction(async (tx) => {
    if (step === "submit") await submitCount(tx, input);
    else if (step === "reopen") await reopenCount(tx, input);
    else if (step === "post") await postCount(tx, input);
    else await cancelCount(tx, input);
  });
}

export async function saveScheduleStep(who: Who & { timeZone: string }, input: ScheduleInput) {
  const firstRunAt = dateInputToDate(input.firstRunDate, who.timeZone, "09:00");
  if (firstRunAt && Number.isNaN(firstRunAt.getTime())) throw new DomainError("Pick a start date.", "invalid");
  return prisma.$transaction((tx) => saveCountSchedule(tx, { spaceId: who.spaceId, scheduleId: null, name: input.name, locationId: input.locationId, categoryId: input.categoryId, everyDays: input.everyDays, blind: input.blind, active: true, firstRunAt }));
}

/** Pause or resume a schedule, keeping its next run date. */
export async function setScheduleActiveStep(who: Who, input: { scheduleId: string; active: boolean }) {
  await prisma.$transaction(async (tx) => {
    const schedule = await tx.countSchedule.findFirst({ where: { id: input.scheduleId, spaceId: who.spaceId } });
    if (!schedule) throw new DomainError("That schedule wasn't found.", "not_found");
    await saveCountSchedule(tx, {
      spaceId: who.spaceId, scheduleId: schedule.id, name: schedule.name, locationId: schedule.locationId, categoryId: schedule.categoryId,
      everyDays: schedule.everyDays, blind: schedule.blind, active: input.active, firstRunAt: schedule.nextRunAt,
    });
  });
}
