import "server-only";

import { prisma } from "@/lib/db";
import { loanRef } from "@/lib/catalogue/references";
import { emitEvent } from "@/lib/events/emit";
import { formatDayLong } from "@/lib/format/datetime";
import { notifyUsers, staffIds } from "@/lib/notify";
import { syncAutomaticRestriction } from "./access";
import { loanUrl } from "./workflow/common";

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 200;
const ACTIVE = ["ISSUED", "PARTIALLY_RETURNED"] as const;

/**
 * Loan reminders, run by the beat every few minutes. Each reminder is
 * claimed with a conditional update before it is sent, so overlapping runs
 * never send twice. Changing the due date clears the claims.
 */
export async function runLoanReminders(now = new Date()) {
  let sent = 0;
  const spaces = await prisma.space.findMany({ where: { archivedAt: null, lendingEnabled: true }, select: { id: true, slug: true, timezone: true, reminderDaysBefore: true, overdueReminderDays: true, overdueEscalateDays: true } });
  for (const space of spaces) {
    const soonBefore = new Date(now.getTime() + Math.max(space.reminderDaysBefore, 0.5) * DAY_MS);
    const dueSoon = await prisma.loan.findMany({ where: { spaceId: space.id, status: { in: [...ACTIVE] }, dueReminderAt: null, dueAt: { gt: now, lte: soonBefore } }, select: { id: true, number: true, borrowerId: true, dueAt: true }, take: BATCH });
    for (const loan of dueSoon) {
      await prisma.$transaction(async (tx) => {
        const claim = await tx.loan.updateMany({ where: { id: loan.id, dueReminderAt: null }, data: { dueReminderAt: now } });
        if (claim.count !== 1) return;
        await notifyUsers(tx, space.id, [loan.borrowerId], { kind: "loan.due_soon", title: `${loanRef(loan.number)} is due ${formatDayLong(loan.dueAt, space.timezone)}`, body: "Bring it back to the desk, or renew it from your loans page if renewals are open.", url: loanUrl(space.slug, loan.id, "borrower"), email: true });
        sent += 1;
      });
    }

    const repeatBefore = new Date(now.getTime() - space.overdueReminderDays * DAY_MS);
    const overdue = await prisma.loan.findMany({
      where: { spaceId: space.id, status: { in: [...ACTIVE] }, dueAt: { lt: now }, OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: repeatBefore } }] },
      select: { id: true, number: true, borrowerId: true, dueAt: true, overdueAt: true, lastReminderAt: true },
      take: BATCH,
    });
    for (const loan of overdue) {
      await prisma.$transaction(async (tx) => {
        const claim = await tx.loan.updateMany({ where: { id: loan.id, lastReminderAt: loan.lastReminderAt }, data: { lastReminderAt: now, remindersSent: { increment: 1 }, overdueAt: loan.overdueAt ?? now } });
        if (claim.count !== 1) return;
        const days = Math.max(1, Math.floor((now.getTime() - loan.dueAt.getTime()) / DAY_MS));
        await notifyUsers(tx, space.id, [loan.borrowerId], { kind: "loan.overdue", title: `${loanRef(loan.number)} is ${days} ${days === 1 ? "day" : "days"} overdue`, body: "Please bring it back to the desk as soon as you can.", url: loanUrl(space.slug, loan.id, "borrower"), email: true });
        if (!loan.overdueAt) {
          await emitEvent(tx, { spaceId: space.id, type: "loan.overdue", data: { loanId: loan.id, reference: loanRef(loan.number), dueAt: loan.dueAt.toISOString() } });
          await syncAutomaticRestriction(tx, { spaceId: space.id, userId: loan.borrowerId, now });
        }
        sent += 1;
      });
    }

    if (space.overdueEscalateDays > 0) {
      const escalate = await prisma.loan.findMany({ where: { spaceId: space.id, status: { in: [...ACTIVE] }, escalatedAt: null, dueAt: { lt: new Date(now.getTime() - space.overdueEscalateDays * DAY_MS) } }, select: { id: true, number: true }, take: BATCH });
      for (const loan of escalate) {
        await prisma.$transaction(async (tx) => {
          const claim = await tx.loan.updateMany({ where: { id: loan.id, escalatedAt: null }, data: { escalatedAt: now } });
          if (claim.count !== 1) return;
          await notifyUsers(tx, space.id, await staffIds(tx, space.id, ["MANAGER"]), { kind: "loan.escalated", title: `${loanRef(loan.number)} is ${space.overdueEscalateDays}+ days overdue`, body: "Follow up with the member, or mark items lost.", url: loanUrl(space.slug, loan.id, "staff"), email: true });
          sent += 1;
        });
      }
    }
  }
  return { sent };
}
