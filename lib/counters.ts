import "server-only";

import type { DbClient } from "@/lib/db";

export type SequenceName = "loan" | "transfer" | "count" | "purchase" | "asset" | "container" | "repair";

/**
 * Next value of a per-space sequence. Atomic via INSERT … ON CONFLICT DO
 * UPDATE, so concurrent creators (even for the first value) never collide.
 * Call inside the transaction that inserts the numbered row (gaps after a
 * rollback are harmless).
 */
export async function nextSpaceSequence(client: DbClient, spaceId: string, name: SequenceName): Promise<number> {
  const rows = await client.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "SpaceCounter" ("spaceId", "name", "value")
    VALUES (${spaceId}, ${name}, 1)
    ON CONFLICT ("spaceId", "name") DO UPDATE SET "value" = "SpaceCounter"."value" + 1
    RETURNING "value"
  `;
  return Number(rows[0]!.value);
}
