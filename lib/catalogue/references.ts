/**
 * Human references (pure and client-safe): LN-0042, TR-0007, CC-0003,
 * PO-0011, RP-0005 and asset tags such as TSK-000042.
 */
export function loanRef(number: number) {
  return `LN-${String(number).padStart(4, "0")}`;
}
export function transferRef(number: number) {
  return `TR-${String(number).padStart(4, "0")}`;
}
export function countRef(number: number) {
  return `CC-${String(number).padStart(4, "0")}`;
}
export function purchaseRef(number: number) {
  return `PO-${String(number).padStart(4, "0")}`;
}
export function repairRef(number: number) {
  return `RP-${String(number).padStart(4, "0")}`;
}
export function assetTag(prefix: string, number: number) {
  return `${prefix}-${String(number).padStart(6, "0")}`;
}
export function containerCode(number: number) {
  return `BOX-${String(number).padStart(3, "0")}`;
}

/** Parse "LN-0042" or "42" back to a number for search boxes. */
export function parseRef(value: string, prefix: "LN" | "TR" | "CC" | "PO"): number | null {
  const match = value.trim().toUpperCase().match(new RegExp(`^(?:${prefix}-?)?0*(\\d{1,9})$`));
  return match ? Number(match[1]) : null;
}
