// Generated shared UI types. No backend imports.
import type { JsonValue } from "./contracts";
export type Shared0 = Array<{ "name": "outbox" | "scheduled"; "counts": { [key: string]: number }; "paused": boolean; "failures": Array<{ "id": string; "attempts": number; "at": number; "reason": string }> }>;
export type Shared1 = { "user": { "name": null | string; "email": string; "image": null | string }; "space": { "slug": string; "name": string; "roleLabel": string }; "spaces": Array<{ "id": string; "slug": string; "name": string; "role": "OWNER" | "ADMIN" | "MANAGER" | "STAFF" | "MEMBER" }>; "nav": Array<{ "key": string; "label": null | string; "items": Array<{ "key": string; "label": string; "href": string; "exact": boolean }> }>; "unreadNotifications": number; "isSuperAdmin": boolean };
