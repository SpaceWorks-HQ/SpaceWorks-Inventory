import { Card, CardHeader, EmptyState } from "@/components/ui/display";
import { CreateWebhookDialog } from "./CreateWebhookDialog";
import { EndpointItem } from "./EndpointItem";
import type { EndpointRow } from "./types";

export function WebhooksPanel({ slug, endpoints, max }: { slug: string; endpoints: EndpointRow[]; max: number }) {
  return (
    <Card as="section" aria-labelledby="webhooks-heading">
      <CardHeader
        title={<span id="webhooks-heading">Webhooks</span>}
        description="Signed events for loans, stock, transfers and payments. Payloads carry ids, numbers and quantities, never emails or remarks."
        action={<CreateWebhookDialog slug={slug} disabled={endpoints.length >= max} />}
      />
      {endpoints.length === 0 ? (
        <EmptyState title="No webhooks yet.">Add one to send events to another app.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-5">
          {endpoints.map((endpoint) => <EndpointItem key={endpoint.id} slug={slug} endpoint={endpoint} />)}
        </ul>
      )}
    </Card>
  );
}
