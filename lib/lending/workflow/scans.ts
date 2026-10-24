import "server-only";

import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { extractQrCode } from "@/lib/catalogue/qr";
import { resolveScan, type Resolved } from "@/lib/catalogue/resolve";

export type ScanSet = {
  codes: string[];
  items: Set<string>;
  assets: Map<string, Extract<Resolved, { kind: "asset" }>>;
  containers: Extract<Resolved, { kind: "container" }>[];
};

/** Resolve every scanned value inside the space; an unknown or foreign code stops the handover. */
export async function resolveScans(tx: Tx, spaceId: string, scanned: string[]): Promise<ScanSet> {
  const extracted = scanned.filter((value) => value.trim()).map((value) => extractQrCode(value));
  if (extracted.some((code) => code === null)) throw new DomainError("One of the scans isn't a Space Works QR code. Scan the label again.", "invalid");
  const codes = [...new Set(extracted as string[])];
  if (codes.length > 300) throw new DomainError("Scan at most 300 codes at once.", "invalid");
  const result: ScanSet = { codes, items: new Set(), assets: new Map(), containers: [] };
  for (const code of codes) {
    const resolved = await resolveScan(spaceId, code, tx);
    if (!resolved) throw new DomainError(`Code ${code} isn't from this space.`, "invalid");
    if (resolved.kind === "item") result.items.add(resolved.itemId);
    else if (resolved.kind === "asset") result.assets.set(resolved.id, resolved);
    else if (resolved.kind === "container") result.containers.push(resolved);
    else throw new DomainError(`${resolved.label} is a ${resolved.kind}; scan the item, asset or container labels.`, "invalid");
  }
  if (result.containers.length > 1) throw new DomainError("Scan one container per loan.", "invalid");
  return result;
}
