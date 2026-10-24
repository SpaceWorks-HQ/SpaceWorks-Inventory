/**
 * A business-rule refusal with a UI-safe message ("That location still
 * holds stock."). Server Actions and API routes turn it into a 400/404/409
 * answer; anything else is an unexpected failure.
 */
export class DomainError extends Error {
  override name = "DomainError";
  constructor(message: string, readonly code: "invalid" | "not_found" | "conflict" | "forbidden" = "invalid") {
    super(message);
  }
}

export function notFound(what: string): never {
  throw new DomainError(`That ${what} wasn't found.`, "not_found");
}
