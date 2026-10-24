// Paged desk flows (docs/DESIGN.md: "a stepper card: scan → confirm lines →
// photos and remarks → done"). Pure helpers shared by the client stepper, the
// completion card and their tests.

/** The furthest step that can be opened: every earlier step must be ready. */
export function reachableStep(ready: readonly boolean[]): number {
  const firstOpen = ready.findIndex((done) => !done);
  return firstOpen === -1 ? Math.max(0, ready.length - 1) : firstOpen;
}

/** Whether step `index` may be opened from the step indicator. */
export function canOpenStep(ready: readonly boolean[], index: number): boolean {
  return index >= 0 && index < ready.length && index <= reachableStep(ready);
}

/** Flows that end on a record page with `?done=<kind>`. */
export const DONE_KINDS = ["issue", "return", "self-return", "self-checkout", "dispatch", "receive", "receive-return"] as const;
export type DoneKind = (typeof DONE_KINDS)[number];

/** The `?done=` kind if it is one this page shows; anything else is ignored. */
export function doneKindOf(value: unknown, allowed: readonly DoneKind[] = DONE_KINDS): DoneKind | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as DoneKind) : null;
}

/** What each finished flow tells the person, and the steps it went through. */
export const DONE_COPY: Record<DoneKind, { title: string; body: string; steps: readonly string[] }> = {
  issue: { title: "Handed over", body: "The loan is on loan now. The scans and photos are in the evidence below, and the borrower has been told the due date.", steps: ["Scan", "Check the lines", "Photos and remarks"] },
  return: { title: "Return recorded", body: "What came back is in stock again. Anything still out stays on the loan; damaged or lost units have an incident.", steps: ["What came back", "Scan", "Photos and remarks"] },
  "self-return": { title: "Returned", body: "Thanks for bringing it back. Staff can see the scans and photos.", steps: ["Scan", "Check the lines", "Photos and remarks"] },
  "self-checkout": { title: "Checked out", body: "It's yours until the due date below. Bring everything back to the desk, or return it yourself if self-return is on.", steps: ["Scan", "Check the lines", "Photos and remarks"] },
  dispatch: { title: "Dispatched", body: "The units are in transit and the receiving side has been told. The scans and photos are in the evidence below.", steps: ["Pick list", "Scan labels", "Photos and shipping"] },
  receive: { title: "Received", body: "The units are in stock on the shelf you chose. Anything not unpacked yet stays in transit.", steps: ["Scan what arrived", "Check the quantities", "Shelf, photos and remarks"] },
  "receive-return": { title: "Return received", body: "The returned units are back in stock on the shelf you chose.", steps: ["Scan returned units", "Check the quantities", "Shelf, photos and remarks"] },
};

/** The record page's address with the completion marker, keeping the path. */
export function withDone(pathname: string, kind: DoneKind): string {
  return `${pathname}?done=${kind}`;
}

/** The hint for an evidence step that is not ready yet. */
export function evidenceHint(minPhotos: number, remarksRequired: boolean): string {
  const photos = Math.max(1, minPhotos);
  const wanted = `at least ${photos} ${photos === 1 ? "photo" : "photos"}`;
  return remarksRequired ? `Add ${wanted} and the remarks.` : `Add ${wanted}.`;
}

const AFTER_ISSUE = ["ISSUED", "PARTIALLY_RETURNED", "RETURNED", "CLOSED_WITH_ISSUE"];
const AFTER_RETURN = ["PARTIALLY_RETURNED", "RETURNED", "CLOSED_WITH_ISSUE"];
const AFTER_DISPATCH = ["DISPATCHED", "PARTIALLY_RECEIVED", "RECEIVED", "RETURNING", "RETURNED"];
const AFTER_RECEIPT = ["PARTIALLY_RECEIVED", "RECEIVED", "RETURNING", "RETURNED"];
const STATUS_AFTER: Record<DoneKind, readonly string[]> = {
  issue: AFTER_ISSUE, "self-checkout": AFTER_ISSUE, return: AFTER_RETURN, "self-return": AFTER_RETURN,
  dispatch: AFTER_DISPATCH, receive: AFTER_RECEIPT, "receive-return": ["RETURNING", "RETURNED"],
};

/**
 * The completion card only when the record is in a state the flow leads to,
 * so a hand-typed `?done=issue` on a loan that was never issued shows nothing.
 */
export function doneFor(value: unknown, allowed: readonly DoneKind[], status: string): DoneKind | null {
  const kind = doneKindOf(value, allowed);
  return kind && STATUS_AFTER[kind].includes(status) ? kind : null;
}
