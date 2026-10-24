"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis } from "lucide-react";
import { deleteWebhookAction, rotateWebhookSecretAction, sendWebhookTestAction, setWebhookEnabledAction } from "@/app/actions/integrations";
import { IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Chip } from "@/components/ui/display";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/feedback/ToastProvider";
import { DeliveriesTable } from "./DeliveriesTable";
import { SecretDialog } from "./SecretDialog";
import type { EndpointRow } from "./types";

const TONE: Record<EndpointRow["state"], "success" | "neutral" | "warning"> = { enabled: "success", off: "neutral", tripped: "warning" };

type Confirm = "rotate" | "delete" | null;

export function EndpointItem({ slug, endpoint }: { slug: string; endpoint: EndpointRow }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) showToast(result.error ?? "Couldn't save. Try again.", "error");
      else {
        showToast(success, "success");
        router.refresh();
      }
    });

  const on = endpoint.state === "enabled";
  return (
    <li className="flex flex-col gap-4 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-all text-title text-ink">{endpoint.url}</p>
          {endpoint.description ? <p className="text-body-ui text-ink-secondary">{endpoint.description}</p> : null}
          <p className="mt-1 text-caption text-ink-muted">
            {endpoint.eventLabels.join(", ")}
            {endpoint.lastSuccess ? ` · Last delivered ${endpoint.lastSuccess}` : ""}
            {endpoint.failureCount > 0 ? ` · ${endpoint.failureCount} failed in a row` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Chip tone={TONE[endpoint.state]} size="sm">{endpoint.stateLabel}</Chip>
          <Menu>
            <MenuTrigger asChild>
              <IconButton label={`Actions for webhook to ${endpoint.host}`} size="sm" disabled={pending}><Ellipsis /></IconButton>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem disabled={!on} onSelect={() => run(() => sendWebhookTestAction(slug, { endpointId: endpoint.id }), "Test event queued.")}>Send test event</MenuItem>
              <MenuItem onSelect={() => run(() => setWebhookEnabledAction(slug, { endpointId: endpoint.id, enabled: !on }), on ? "Webhook switched off." : "Webhook switched on.")}>
                {on ? "Switch off" : "Switch on"}
              </MenuItem>
              <MenuItem onSelect={() => setConfirm("rotate")}>New signing secret</MenuItem>
              <MenuSeparator />
              <MenuItem danger onSelect={() => setConfirm("delete")}>Delete webhook</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
      <DeliveriesTable slug={slug} deliveries={endpoint.deliveries} label={`Recent deliveries to ${endpoint.host}`} />
      <ConfirmDialog
        open={confirm === "rotate"}
        title="Create a new signing secret?"
        message="The current secret stops working straight away. Update the receiving app with the new one."
        confirmLabel="Create new secret"
        destructive={false}
        loading={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          startTransition(async () => {
            const result = await rotateWebhookSecretAction(slug, { endpointId: endpoint.id });
            setConfirm(null);
            if (!result.ok) showToast(result.error, "error");
            else setSecret(result.data?.secret ?? null);
          })
        }
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title="Delete this webhook?"
        message="Events stop going to this address and its delivery history is removed."
        confirmLabel="Delete webhook"
        loading={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          run(() => deleteWebhookAction(slug, { endpointId: endpoint.id }), "Webhook deleted.");
        }}
      />
      <SecretDialog title="New signing secret" description="Use it to check the X-SpaceWorks-Signature header from now on." secret={secret} onClose={() => { setSecret(null); router.refresh(); }} />
    </li>
  );
}
