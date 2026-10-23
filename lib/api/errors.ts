import { ZodError } from "zod";
import { DomainError } from "@/lib/domainError";
import { StockError } from "@/lib/inventory/availability/errors";

/**
 * Pure mapping from thrown refusals to API error envelopes
 * `{ error: { code, message } }`. Anything unmapped is an unexpected failure
 * (500) and is never described to the caller.
 */
export type ApiFailure = { status: number; code: string; message: string };

/** A bad request detected by the API layer itself (missing body, unknown field, bad query). */
export class ApiInputError extends Error {
  override name = "ApiInputError";
  constructor(message: string, readonly status = 400, readonly code = "INVALID") {
    super(message);
  }
}

const DOMAIN_STATUS: Record<DomainError["code"], number> = { invalid: 400, not_found: 404, conflict: 409, forbidden: 403 };

const STOCK_STATUS: Record<StockError["code"], number> = { insufficient_stock: 409, asset_unavailable: 409, stale_count: 409, invalid_quantity: 400 };

function zodMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Check the request body.";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

export function failureFor(error: unknown): ApiFailure | null {
  if (error instanceof ApiInputError) return { status: error.status, code: error.code, message: error.message };
  if (error instanceof ZodError) return { status: 400, code: "INVALID", message: zodMessage(error) };
  if (error instanceof DomainError) return { status: DOMAIN_STATUS[error.code] ?? 400, code: error.code.toUpperCase(), message: error.message };
  if (error instanceof StockError) return { status: STOCK_STATUS[error.code] ?? 409, code: error.code.toUpperCase(), message: error.message };
  return null;
}

export const NOT_FOUND = (what: string): ApiFailure => ({ status: 404, code: "NOT_FOUND", message: `That ${what} wasn't found.` });
