"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeApiKeyAction } from "@/app/actions/integrations";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Card, CardHeader, Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/feedback/ToastProvider";
import { CreateApiKeyDialog } from "./CreateApiKeyDialog";
import type { ApiKeyRow } from "./types";

const STATE: Record<ApiKeyRow["state"], { label: string; tone: "success" | "neutral" | "warning" }> = {
  ACTIVE: { label: "Active", tone: "success" },
  REVOKED: { label: "Revoked", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "warning" },
};

export function ApiKeysPanel({ slug, keys }: { slug: string; keys: ApiKeyRow[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [revoking, setRevoking] = useState<ApiKeyRow | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card as="section" aria-labelledby="api-keys-heading">
      <CardHeader
        title={<span id="api-keys-heading">API keys</span>}
        description="For scripts and other tools that read or change this space through the REST API at /api/v1."
        action={<CreateApiKeyDialog slug={slug} />}
      />
      {keys.length === 0 ? (
        <EmptyState title="No API keys yet.">Create one when a tool needs to reach this space.</EmptyState>
      ) : (
        <Table label="API keys">
          <THead>
            <tr>
              <TH>Key</TH>
              <TH>Scopes</TH>
              <TH>Last used</TH>
              <TH>Expires</TH>
              <TH>Status</TH>
              <TH><span className="sr-only">Actions</span></TH>
            </tr>
          </THead>
          <TBody>
            {keys.map((key) => (
              <TR key={key.id}>
                <TD className="min-w-[180px]">
                  <span className="block font-semibold">{key.name}</span>
                  <span className="code-text block text-caption text-ink-muted">{key.prefix}</span>
                  <span className="block text-caption text-ink-muted">{key.createdBy ? `By ${key.createdBy}, ` : ""}{key.created}</span>
                </TD>
                <TD className="min-w-[200px] text-body-ui text-ink-secondary">{key.scopeLabels.join(", ")}</TD>
                <TD className="whitespace-nowrap text-ink-muted">{key.lastUsed ?? "Never"}</TD>
                <TD className="whitespace-nowrap text-ink-muted">{key.expires ?? "Never"}</TD>
                <TD><Chip tone={STATE[key.state].tone} size="sm">{STATE[key.state].label}</Chip></TD>
                <TD className="text-right">
                  {key.state === "ACTIVE" ? (
                    <Button size="sm" variant="dangerQuiet" disabled={pending} onClick={() => setRevoking(key)}>Revoke</Button>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <ConfirmDialog
        open={revoking !== null}
        title={`Revoke ${revoking?.name ?? "this key"}?`}
        message="Anything using this key stops working straight away. This can't be undone."
        confirmLabel="Revoke key"
        loading={pending}
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          const target = revoking;
          if (!target) return;
          startTransition(async () => {
            const result = await revokeApiKeyAction(slug, { tokenId: target.id });
            setRevoking(null);
            if (!result.ok) showToast(result.error, "error");
            else {
              showToast("API key revoked.", "success");
              router.refresh();
            }
          });
        }}
      />
    </Card>
  );
}
