import { NextResponse } from "next/server";
import { enqueueDueOutbox } from "@/lib/queue/enqueue";
import { bearerSecretMatches } from "@/lib/bearerSecret";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/**
 * External scheduler hook (`Authorization: Bearer $CRON_SECRET`).
 * By default it hands due outbox rows to the BullMQ worker. With
 * `?run=inline` it does the work itself, once: delivers a batch of email and
 * webhooks, runs every periodic job (reminders, count schedules, payment
 * reconciliation) and the retention purge. That is how free hosting without
 * a worker (Render free + the Cloudflare cron Worker) keeps working. Both
 * modes are safe to run at the same time as a worker: rows are claimed atomically.
 */
export async function POST(request: Request) {
  if (!bearerSecretMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new NextResponse("Not found", { status: 404, headers: privateHeaders });
  }
  const inline = new URL(request.url).searchParams.get("run") === "inline";
  try {
    if (inline) {
      const { runOutboxScheduler } = await import("@/lib/outboxWorker");
      const result = await runOutboxScheduler();
      return NextResponse.json({ ok: true, sent: result.sent, failed: result.failed, jobsFailed: result.scheduled.failed.length }, { headers: privateHeaders });
    }
    const result = await enqueueDueOutbox();
    return NextResponse.json({ ok: true, ...result }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ ok: false, error: inline ? "The scheduled work could not run. Try again." : "Jobs could not be queued. Try again." }, { status: 503, headers: privateHeaders });
  }
}
