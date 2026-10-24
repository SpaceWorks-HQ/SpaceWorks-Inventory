import { ApiKeysPanel } from "@/components/integrations/ApiKeysPanel";
import { SignatureHelp } from "@/components/integrations/SignatureHelp";
import { WebhooksPanel } from "@/components/integrations/WebhooksPanel";
import type { ApiKeyRow, EndpointRow } from "@/components/integrations/types";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { PageHeader } from "@/components/ui/display";
import { SettingsLayout } from "@/components/ui/layouts";
import { listApiTokens } from "@/lib/apiTokens";
import { scopeLabel } from "@/lib/apiTokens/scopes";
import { formatDate, formatRelativeTime } from "@/lib/format/datetime";
import { requireSpace } from "@/lib/permissions";
import { ENDPOINT_STATE_LABEL, endpointState, eventWords, listEndpoints, MAX_ENDPOINTS_PER_SPACE, urlHost } from "@/lib/webhooks";

export const metadata = { title: "Integrations" };

type Token = Awaited<ReturnType<typeof listApiTokens>>[number];
type Endpoint = Awaited<ReturnType<typeof listEndpoints>>[number];

function keyRow(token: Token, timezone: string, now: Date): ApiKeyRow {
  const state = token.revokedAt ? "REVOKED" : token.expiresAt && token.expiresAt <= now ? "EXPIRED" : "ACTIVE";
  return {
    id: token.id,
    name: token.name,
    prefix: token.prefix,
    scopeLabels: token.scopes.map(scopeLabel),
    lastUsed: token.lastUsedAt ? formatRelativeTime(token.lastUsedAt, timezone, now) : null,
    expires: token.expiresAt ? formatDate(token.expiresAt, timezone) : null,
    createdBy: token.createdBy?.name ?? null,
    created: formatDate(token.createdAt, timezone),
    state,
  };
}

function endpointRow(endpoint: Endpoint, timezone: string, now: Date): EndpointRow {
  const state = endpointState(endpoint);
  return {
    id: endpoint.id,
    url: endpoint.url,
    host: urlHost(endpoint.url),
    description: endpoint.description,
    events: endpoint.events,
    eventLabels: eventWords(endpoint.events),
    state,
    stateLabel: ENDPOINT_STATE_LABEL[state],
    failureCount: endpoint.failureCount,
    lastSuccess: endpoint.lastSuccessAt ? formatRelativeTime(endpoint.lastSuccessAt, timezone, now) : null,
    deliveries: endpoint.deliveries.map((delivery) => ({
      id: delivery.id,
      eventType: delivery.eventType,
      status: delivery.status,
      responseStatus: delivery.responseStatus,
      attempts: delivery.attempts,
      lastError: delivery.lastError,
      when: formatRelativeTime(delivery.createdAt, timezone, now),
    })),
  };
}

export default async function IntegrationsSettingsPage({ params }: PageProps<"/s/[spaceSlug]/settings/integrations">) {
  const { spaceSlug } = await params;
  const { space } = await requireSpace(spaceSlug, "MANAGER");
  const [tokens, endpoints] = await Promise.all([listApiTokens(space.id), listEndpoints(space.id)]);
  const now = new Date();
  const keys = tokens.map((token) => keyRow(token, space.timezone, now));
  const hooks = endpoints.map((endpoint) => endpointRow(endpoint, space.timezone, now));
  const slug = space.slug;

  return (
    <SettingsLayout
      header={<PageHeader title="Space settings" description="API keys and webhooks connect this space to other tools." />}
      tabs={<SettingsTabs slug={slug} />}
    >
      <div className="flex flex-col gap-6">
        <ApiKeysPanel slug={slug} keys={keys} />
        <WebhooksPanel slug={slug} endpoints={hooks} max={MAX_ENDPOINTS_PER_SPACE} />
        <SignatureHelp />
      </div>
    </SettingsLayout>
  );
}
