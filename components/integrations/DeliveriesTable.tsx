"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryWebhookDeliveryAction } from "@/app/actions/integrations";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/feedback/ToastProvider";
import type { DeliveryRow } from "./types";

const STATUS: Record<DeliveryRow["status"], { label: string; tone: "info" | "success" | "danger" }> = {
  PENDING: { label: "Waiting", tone: "info" },
  SUCCEEDED: { label: "Delivered", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
};

export function DeliveriesTable({ slug, deliveries, label }: { slug: string; deliveries: DeliveryRow[]; label: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  if (deliveries.length === 0) return <p className="text-body-ui text-ink-muted">No deliveries yet. Send a test event to check the connection.</p>;
  return (
    <Table label={label}>
      <THead>
        <tr>
          <TH>Event</TH>
          <TH>Status</TH>
          <TH>Response</TH>
          <TH>Attempts</TH>
          <TH>When</TH>
          <TH><span className="sr-only">Actions</span></TH>
        </tr>
      </THead>
      <TBody>
        {deliveries.map((delivery) => (
          <TR key={delivery.id}>
            <TD className="code-text whitespace-nowrap">{delivery.eventType}</TD>
            <TD><Chip tone={STATUS[delivery.status].tone} size="sm">{STATUS[delivery.status].label}</Chip></TD>
            <TD className="min-w-[160px] text-ink-muted">
              {delivery.responseStatus !== null ? <span className="tabular-nums text-ink">{delivery.responseStatus}</span> : null}
              {delivery.lastError ? <span className="block text-caption">{delivery.lastError}</span> : delivery.responseStatus === null ? "None yet" : null}
            </TD>
            <TD className="tabular-nums">{delivery.attempts}</TD>
            <TD className="whitespace-nowrap text-ink-muted">{delivery.when}</TD>
            <TD className="text-right">
              {delivery.status === "FAILED" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  aria-label={`Retry ${delivery.eventType} delivery`}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await retryWebhookDeliveryAction(slug, { deliveryId: delivery.id });
                      if (!result.ok) showToast(result.error, "error");
                      else {
                        showToast("Delivery queued again.", "success");
                        router.refresh();
                      }
                    })
                  }
                >
                  Retry
                </Button>
              ) : null}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
