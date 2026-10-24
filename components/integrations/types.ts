/** Plain, serialisable rows the integrations page passes to its client components. */

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopeLabels: string[];
  lastUsed: string | null;
  expires: string | null;
  createdBy: string | null;
  created: string;
  state: "ACTIVE" | "REVOKED" | "EXPIRED";
};

export type DeliveryRow = {
  id: string;
  eventType: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  responseStatus: number | null;
  attempts: number;
  lastError: string | null;
  when: string;
};

export type EndpointRow = {
  id: string;
  url: string;
  host: string;
  description: string | null;
  events: string[];
  eventLabels: string[];
  state: "enabled" | "off" | "tripped";
  stateLabel: string;
  failureCount: number;
  lastSuccess: string | null;
  deliveries: DeliveryRow[];
};
