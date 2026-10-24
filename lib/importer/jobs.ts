import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { DomainError, notFound } from "@/lib/domainError";
import { applyRows } from "./apply";
import { IMPORT_COLUMNS, isImportKind, mapHeaders, toRecords, type ImportKind } from "./columns";
import { toCsv } from "./csv";
import { readUpload } from "./read";
import { validateRows, type CheckedRow, type ImportOptions, type SourceRow } from "./validate";

type Space = { id: string; currency: string };
type Actor = { userId: string | null };
export type ImportStats = { total: number; valid: number; invalid: number; created?: number; updated?: number };
type StoredRow = SourceRow & { errors: string[] };
type Stored = { kind: ImportKind; options: ImportOptions; ignored: string[]; rows: StoredRow[] };

export const PREVIEW_ROW_LIMIT = 200;

function statsOf(rows: StoredRow[]): ImportStats {
  const invalid = rows.filter((row) => row.errors.length > 0).length;
  return { total: rows.length, valid: rows.length - invalid, invalid };
}

const stripChecked = (rows: CheckedRow[]): StoredRow[] => rows.map(({ line, values, errors }) => ({ line, values, errors }));
const json = (value: unknown) => value as Prisma.InputJsonValue;

function readStored(rows: Prisma.JsonValue): Stored {
  const stored = rows as unknown as Stored;
  if (!stored || !isImportKind(stored.kind) || !Array.isArray(stored.rows)) throw new DomainError("This import can't be read. Upload the file again.", "invalid");
  return stored;
}

/**
 * Step 1: read the file, check every row and keep the parsed rows on an
 * ImportJob (PREVIEWED). Nothing in the catalogue changes yet.
 */
export async function previewImport(space: Space, actor: Actor, input: { kind: ImportKind; fileName: string; bytes: Buffer; options: ImportOptions }) {
  const sheet = await readUpload({ name: input.fileName, bytes: input.bytes });
  const headers = mapHeaders(input.kind, sheet.headers);
  if (headers.missing.length > 0) {
    throw new DomainError(`The file has no ${headers.missing.join(", ")} column. Download the template to see the expected headers.`);
  }
  const source = toRecords(headers, sheet.rows).map((values, index) => ({ line: index + 2, values }));
  const checked = await validateRows(prisma, space, input.kind, source, input.options);
  const rows = stripChecked(checked);
  const stats = statsOf(rows);
  const stored: Stored = { kind: input.kind, options: input.options, ignored: headers.ignored, rows };
  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.importJob.create({ data: { spaceId: space.id, kind: input.kind, fileName: input.fileName.slice(0, 200), rows: json(stored), stats: json(stats), requestedById: actor.userId } });
    await recordAuditEvent({ client: tx, action: "import.previewed", spaceId: space.id, actorId: actor.userId, targetType: "ImportJob", targetId: created.id, metadata: { kind: input.kind, ...stats } });
    return created;
  });
  return { jobId: job.id, stats };
}

/** Check a previewed import again, optionally with different options. */
export async function recheckImport(space: Space, actor: Actor, jobId: string, options: ImportOptions) {
  const job = await prisma.importJob.findFirst({ where: { id: jobId, spaceId: space.id } });
  if (!job) notFound("import");
  if (job.status !== "PREVIEWED") throw new DomainError("This import is finished. Upload the file again to start a new one.", "conflict");
  const stored = readStored(job.rows);
  const rows = stripChecked(await validateRows(prisma, space, stored.kind, stored.rows, options));
  const stats = statsOf(rows);
  await prisma.$transaction(async (tx) => {
    await tx.importJob.update({ where: { id: job.id }, data: { rows: json({ ...stored, options, rows }), stats: json(stats) } });
    await recordAuditEvent({ client: tx, action: "import.rechecked", spaceId: space.id, actorId: actor.userId, targetType: "ImportJob", targetId: job.id, metadata: { kind: stored.kind, ...stats } });
  });
  return { stats };
}

/**
 * Step 2: lock the job, check every row again against the database as it
 * is now, and apply the valid rows in this transaction. Rows that fail
 * either check are skipped and reported; the job becomes APPLIED.
 */
export async function applyImportJob(tx: Tx, space: Space, jobId: string, actor: Actor) {
  const [locked] = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT "id", "status"::text AS "status" FROM "ImportJob" WHERE "id" = ${jobId} AND "spaceId" = ${space.id} FOR UPDATE`;
  if (!locked) notFound("import");
  if (locked.status !== "PREVIEWED") throw new DomainError("This import was already applied. Upload the file again to import more.", "conflict");
  const job = await tx.importJob.findUniqueOrThrow({ where: { id: jobId } });
  const stored = readStored(job.rows);
  const checked = await validateRows(tx, space, stored.kind, stored.rows, stored.options);
  const outcome = await applyRows({ tx, spaceId: space.id, actor, jobId, options: stored.options }, stored.kind, checked);
  const failed = new Map(outcome.failed.map((f) => [f.line, f.error]));
  const rows = stripChecked(checked).map((row) => (failed.has(row.line) ? { ...row, errors: [...row.errors, failed.get(row.line)!] } : row));
  const stats: ImportStats = { ...statsOf(rows), created: outcome.created, updated: outcome.updated };
  await tx.importJob.update({ where: { id: jobId }, data: { status: "APPLIED", appliedAt: new Date(), rows: json({ ...stored, rows }), stats: json(stats) } });
  await recordAuditEvent({ client: tx, action: "import.applied", spaceId: space.id, actorId: actor.userId, targetType: "ImportJob", targetId: jobId, metadata: { kind: stored.kind, created: outcome.created, updated: outcome.updated, skipped: stats.invalid } });
  return stats;
}

/** Mark an import that crashed while applying (nothing was changed: its transaction rolled back). */
export async function markImportFailed(spaceId: string, jobId: string, actor: Actor) {
  const updated = await prisma.importJob.updateMany({ where: { id: jobId, spaceId, status: "PREVIEWED" }, data: { status: "FAILED" } });
  if (updated.count === 1) await recordAuditEvent({ action: "import.failed", spaceId, actorId: actor.userId, targetType: "ImportJob", targetId: jobId });
}

export type ImportJobView = {
  id: string; kind: ImportKind; fileName: string; status: "PREVIEWED" | "APPLIED" | "FAILED"; options: ImportOptions; ignored: string[];
  stats: ImportStats; columns: string[]; rows: StoredRow[]; createdAt: Date; appliedAt: Date | null;
};

/** One import for the preview screen: its first rows (by default 200) with their errors. */
export async function importJobView(spaceId: string, jobId: string, limit = PREVIEW_ROW_LIMIT): Promise<ImportJobView | null> {
  if (typeof jobId !== "string" || jobId.length > 64) return null;
  const job = await prisma.importJob.findFirst({ where: { id: jobId, spaceId } });
  if (!job || !isImportKind(job.kind)) return null;
  const stored = readStored(job.rows);
  return {
    id: job.id, kind: stored.kind, fileName: job.fileName, status: job.status, options: stored.options, ignored: stored.ignored,
    stats: (job.stats as ImportStats | null) ?? statsOf(stored.rows), columns: IMPORT_COLUMNS[stored.kind].map((c) => c.key),
    rows: stored.rows.slice(0, limit), createdAt: job.createdAt, appliedAt: job.appliedAt,
  };
}

export async function listImportJobs(spaceId: string, take = 10) {
  const jobs = await prisma.importJob.findMany({ where: { spaceId }, orderBy: { createdAt: "desc" }, take, select: { id: true, kind: true, fileName: true, status: true, stats: true, createdAt: true } });
  return jobs.map((job) => ({ ...job, stats: (job.stats as ImportStats | null) ?? { total: 0, valid: 0, invalid: 0 } }));
}

/** CSV of the rows with errors: row number, the errors, then the row's values. */
export async function importErrorReport(spaceId: string, jobId: string): Promise<{ fileName: string; csv: string } | null> {
  const job = await prisma.importJob.findFirst({ where: { id: jobId, spaceId } });
  if (!job || !isImportKind(job.kind)) return null;
  const stored = readStored(job.rows);
  const columns = IMPORT_COLUMNS[stored.kind].map((c) => c.key);
  const rows = stored.rows.filter((row) => row.errors.length > 0).map((row) => [row.line, row.errors.join(" "), ...columns.map((key) => row.values[key] ?? "")]);
  const base = job.fileName.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60) || "import";
  return { fileName: `${base}-errors.csv`, csv: toCsv([["row", "errors", ...columns], ...rows]) };
}
