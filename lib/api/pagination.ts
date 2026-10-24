import { ApiInputError } from "./errors";

/**
 * Cursor pagination for list endpoints (pure). Rows are ordered by id; the
 * cursor is the last id of the previous page. Callers fetch `limit + 1` rows
 * and pass them to `pageOf`.
 */
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type PageRequest = { limit: number; cursor: string | null };

export function parsePage(params: URLSearchParams): PageRequest {
  const rawLimit = params.get("limit");
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null && rawLimit !== "") {
    if (!/^\d+$/.test(rawLimit)) throw new ApiInputError(`limit must be a whole number from 1 to ${MAX_LIMIT}.`);
    limit = Number(rawLimit);
    if (limit < 1 || limit > MAX_LIMIT) throw new ApiInputError(`limit must be a whole number from 1 to ${MAX_LIMIT}.`);
  }
  const cursor = params.get("cursor") || null;
  if (cursor !== null && !CURSOR_PATTERN.test(cursor)) throw new ApiInputError("cursor is not valid. Use nextCursor from the previous page.");
  return { limit, cursor };
}

/** Prisma `where` fragment for rows after the cursor (spread into the query's `where`). */
export function afterCursor(page: PageRequest): { id?: { gt: string } } {
  return page.cursor ? { id: { gt: page.cursor } } : {};
}

export function pageOf<T extends { id: string }>(rows: T[], limit: number): { rows: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const kept = hasMore ? rows.slice(0, limit) : rows;
  return { rows: kept, nextCursor: hasMore ? kept[kept.length - 1]!.id : null };
}

/** `?flag=true|false` → boolean, absent → undefined. */
export function booleanParam(params: URLSearchParams, name: string): boolean | undefined {
  const value = params.get(name);
  if (value === null || value === "") return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new ApiInputError(`${name} must be true or false.`);
}

/** `?name=` restricted to a list of allowed values. */
export function enumParam<T extends string>(params: URLSearchParams, name: string, allowed: readonly T[]): T | undefined {
  const value = params.get(name);
  if (value === null || value === "") return undefined;
  const upper = value.toUpperCase();
  const match = allowed.find((option) => option === value || option === upper);
  if (!match) throw new ApiInputError(`${name} must be one of: ${allowed.join(", ")}.`);
  return match;
}

/** `?name=` holding an id. */
export function idParam(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name);
  if (value === null || value === "") return undefined;
  if (!CURSOR_PATTERN.test(value)) throw new ApiInputError(`${name} is not a valid id.`);
  return value;
}
