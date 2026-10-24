import { z } from "zod";
import { EVENT_TYPES, isEventType } from "@/lib/events/catalogue";

/**
 * Pure, client-safe rules for webhook endpoints: the form schema, how an
 * endpoint's state reads, and how its subscription reads.
 */

export const MAX_ENDPOINTS_PER_SPACE = 20;

export const endpointInputSchema = z.object({
  url: z.string().trim().min(1, "Enter the URL to send events to.").max(500, "Keep the URL under 500 characters."),
  description: z.string().trim().max(120).optional().transform((v) => v || null),
  events: z
    .array(z.string())
    .min(1, "Pick at least one event, or choose all events.")
    .max(EVENT_TYPES.length + 1)
    .refine((events) => events.every((event) => event === "*" || isEventType(event)), "Unknown event type.")
    .transform((events) => (events.includes("*") ? ["*"] : [...new Set(events)])),
});

export type EndpointInput = z.input<typeof endpointInputSchema>;

export type EndpointState = "enabled" | "off" | "tripped";

export function endpointState(endpoint: { enabled: boolean; disabledAt: Date | string | null }): EndpointState {
  if (endpoint.disabledAt) return "tripped";
  return endpoint.enabled ? "enabled" : "off";
}

export const ENDPOINT_STATE_LABEL: Record<EndpointState, string> = {
  enabled: "Enabled",
  off: "Off",
  tripped: "Switched off after failures",
};

/** "All events" or the event labels, in catalogue order. */
export function eventWords(events: readonly string[]): string[] {
  if (events.includes("*")) return ["All events"];
  return EVENT_TYPES.filter((entry) => events.includes(entry.type)).map((entry) => entry.label);
}

/** The host only, for audit metadata and lists (never paths or query strings, which can carry tokens). */
export function urlHost(raw: string): string {
  try {
    return new URL(raw).host;
  } catch {
    return "";
  }
}
