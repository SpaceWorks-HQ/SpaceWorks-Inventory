"use client";

import { setCountScheduleActiveAction } from "@/app/actions/counts";
import type { LocationOption } from "@/components/desk/LocationPicker";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader, Chip } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ScheduleDialog } from "./ScheduleDialog";

export type ScheduleRow = { id: string; name: string; scope: string; everyDays: number; blind: boolean; active: boolean; nextRunLabel: string };

/** Repeating counts a manager sets up; the beat opens a count when each is due. */
export function SchedulesCard({ slug, schedules, locations, categories }: { slug: string; schedules: ScheduleRow[]; locations: LocationOption[]; categories: Array<{ id: string; name: string }> }) {
  const { run, pending, error } = useActionRunner();
  return (
    <Card as="section" aria-label="Count schedules">
      <CardHeader
        title="Count schedules"
        description="Open a count automatically on a regular rhythm."
        action={<ScheduleDialog slug={slug} locations={locations} categories={categories} />}
      />
      {error ? <Callout tone="danger" role="alert" className="mb-4">{error}</Callout> : null}
      {schedules.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-body-ui text-ink-muted">No schedules yet.</p>
      ) : (
        <Table label="Count schedules">
          <THead>
            <tr>
              <TH>Schedule</TH>
              <TH>Repeats</TH>
              <TH>Status</TH>
              <TH><span className="sr-only">Actions</span></TH>
            </tr>
          </THead>
          <TBody>
            {schedules.map((schedule) => (
              <TR key={schedule.id}>
                <TD>
                  <span className="font-semibold">{schedule.name}</span>
                  <span className="block text-caption text-ink-muted">{schedule.scope}{schedule.blind ? " · Blind" : ""}</span>
                </TD>
                <TD className="text-body-ui">
                  Every {schedule.everyDays === 1 ? "day" : `${schedule.everyDays} days`}
                  <span className="block text-caption text-ink-muted">{schedule.active ? `Next run ${schedule.nextRunLabel}` : "No runs while paused"}</span>
                </TD>
                <TD>{schedule.active ? <Chip tone="success">Active</Chip> : <Chip tone="outline">Paused</Chip>}</TD>
                <TD className="text-right">
                  <Button
                    variant="quiet"
                    size="sm"
                    disabled={pending}
                    aria-label={`${schedule.active ? "Pause" : "Resume"} ${schedule.name}`}
                    onClick={() => void run(() => setCountScheduleActiveAction(slug, { scheduleId: schedule.id, active: !schedule.active }), schedule.active ? "Schedule paused." : "Schedule resumed.")}
                  >
                    {schedule.active ? "Pause" : "Resume"}
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
