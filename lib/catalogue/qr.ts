import crypto from "crypto";

/**
 * QR codes are opaque random values; the printed QR encodes
 * `<base url>/q/<code>`. The leading letter says what the code is for, so a
 * scanner can reject the wrong kind early without a lookup. Codes reveal
 * nothing about the space or the item.
 */
export const QR_KINDS = { i: "item", a: "asset", l: "location", k: "kit", c: "container" } as const;
export type QrKind = (typeof QR_KINDS)[keyof typeof QR_KINDS];

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PREFIX: Record<QrKind, string> = { item: "I", asset: "A", location: "L", kit: "K", container: "C" };

/** "A" + 15 characters from a 32-letter alphabet: 75 bits, no ambiguous characters. */
export function newQrCode(kind: QrKind): string {
  const bytes = crypto.randomBytes(15);
  let out = PREFIX[kind];
  for (const byte of bytes) out += ALPHABET[byte % 32];
  return out;
}

export const QR_CODE_PATTERN = /^[IALKC][23456789A-HJ-NP-Z]{15}$/;

/** Accepts the bare code or any URL ending in /q/<code>; returns the code or null. */
export function extractQrCode(scanned: string): string | null {
  const value = scanned.trim();
  const fromUrl = value.match(/\/q\/([A-Za-z0-9]+)\/?(?:[?#].*)?$/);
  const code = (fromUrl ? fromUrl[1]! : value).toUpperCase();
  return QR_CODE_PATTERN.test(code) ? code : null;
}

export function qrKindOf(code: string): QrKind | null {
  const prefix = code[0];
  return (Object.entries(PREFIX).find(([, letter]) => letter === prefix)?.[0] as QrKind | undefined) ?? null;
}

export function qrUrl(code: string, baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "") {
  return `${baseUrl.replace(/\/$/, "")}/q/${code}`;
}
