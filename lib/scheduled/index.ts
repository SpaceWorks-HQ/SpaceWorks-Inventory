import "server-only";
import type { JobDefinition } from "@/lib/queue/definitions";
import { enqueueDueOutbox } from "@/lib/queue/enqueue";
import { purgeExpiredOperationalData } from "@/lib/retention";
import { runCountSchedules } from "@/lib/counts/schedules";
import { runLoanReminders } from "@/lib/lending/reminders";

/**
 * Periodic jobs. Every job is idempotent (safe to run twice or late): it
 * claims rows with conditional updates. A failing job is logged and does
 * not stop the others.
 */
export const SCHEDULED_JOBS: ReadonlyArray<JobDefinition> = [
  { area: "outbox-relay", queue: "outbox", schedule: { every: 5_000 }, run: async () => { await enqueueDueOutbox(); } },
  { area: "loan-reminders", schedule: { every: 5 * 60_000 }, run: async (now) => { await runLoanReminders(now); } },
  { area: "count-schedules", schedule: { every: 15 * 60_000 }, run: async (now) => { await runCountSchedules(now); } },
  { area: "operational-retention", schedule: { pattern: "0 0 * * *", tz: "UTC" }, run: async () => { await purgeExpiredOperationalData(); } },
];

export async function runScheduledJobs(now = new Date()) {
  const failed: string[] = [];
  for (const job of SCHEDULED_JOBS) {
    try {
      // Redis-free development delivers directly through the local worker.
      if (job.area === "outbox-relay" && !process.env.REDIS_URL) continue;
      await job.run(now);
    } catch {
      failed.push(job.area);
      console.error(`[scheduler] ${job.area} job failed`);
    }
  }
  return { ran: SCHEDULED_JOBS.length, failed };
}
