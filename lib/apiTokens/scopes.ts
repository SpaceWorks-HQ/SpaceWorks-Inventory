/**
 * API key scopes (pure and client-safe, so the key form can list them).
 * A key can only do what its scopes allow AND what its creator's current
 * membership allows (see lib/apiTokens/index.ts).
 */
export const API_SCOPES = [
  { value: "read:catalogue", label: "Read catalogue", description: "Items, categories, units, locations and kits." },
  { value: "write:catalogue", label: "Write catalogue", description: "Create and update items, categories and locations." },
  { value: "read:stock", label: "Read stock", description: "Stock levels, availability, assets and the stock ledger." },
  { value: "write:stock", label: "Adjust stock", description: "Record adjustments and receipts with a reason." },
  { value: "read:loans", label: "Read loans", description: "Loan requests, active loans and their history." },
  { value: "write:loans", label: "Manage loan requests", description: "Create, approve, reject and cancel loan requests. Issue and return still need staff in the app." },
  { value: "read:transfers", label: "Read transfers", description: "Transfers in and out of this space with their lines." },
  { value: "write:transfers", label: "Manage transfers", description: "Request, approve, reject and cancel transfers." },
  { value: "read:members", label: "Read members", description: "Member names, roles and borrowing status. Never passwords or MFA." },
  { value: "read:reports", label: "Read reports", description: "Valuation, low stock and overdue summaries." },
] as const;

export type ApiScope = (typeof API_SCOPES)[number]["value"];

export const API_SCOPE_VALUES: readonly ApiScope[] = API_SCOPES.map((scope) => scope.value);

export function isApiScope(value: unknown): value is ApiScope {
  return typeof value === "string" && (API_SCOPE_VALUES as readonly string[]).includes(value);
}

export function scopeLabel(scope: string): string {
  return API_SCOPES.find((entry) => entry.value === scope)?.label ?? scope;
}

/** Normalise a stored scope list: known scopes only, de-duplicated, in catalogue order. */
export function normalizeScopes(scopes: readonly string[]): ApiScope[] {
  const set = new Set(scopes);
  return API_SCOPE_VALUES.filter((scope) => set.has(scope));
}

export function hasScope(scopes: readonly string[], scope: ApiScope): boolean {
  return scopes.includes(scope);
}

/** Plain-text key shape: `swi_<12 char prefix>_<secret>`. The prefix is public, the secret is not. */
export const TOKEN_PATTERN = /^(swi_[A-Za-z0-9]{12})_([A-Za-z0-9_-]{43})$/;

export function parseTokenString(raw: string): { prefix: string; secret: string } | null {
  const match = TOKEN_PATTERN.exec(raw.trim());
  return match ? { prefix: match[1]!, secret: match[2]! } : null;
}

/** Extract the key from an `Authorization: Bearer …` header. */
export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer[ \t]+([^ \t]+)$/i);
  return match ? match[1]! : null;
}
