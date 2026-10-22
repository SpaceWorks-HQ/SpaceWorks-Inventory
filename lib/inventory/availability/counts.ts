import "server-only";

import type { Tx } from "@/lib/db";
import { StockError, type Actor, type MovementRef } from "./errors";
import { applyLevelChange, lockItems, lockLevels } from "./levels";
import { checkLowStock } from "./lowStock";

/**
 * Post one counted quantity. The balance must still equal the snapshot
 * taken when the count started (otherwise stock moved meanwhile and the
 * line is stale: recount). Held units cannot be counted away.
 */
export async function applyCount(tx: Tx, input: { spaceId: string; itemId: string; locationId: string; expected: number; counted: number }, actor: Actor, ref: MovementRef = {}) {
  if (!Number.isSafeInteger(input.counted) || input.counted < 0) throw new StockError("Counted quantity must be zero or more.", "invalid_quantity");
  await lockItems(tx, [input.itemId]);
  const level = (await lockLevels(tx, input.spaceId, [input])).get(`${input.itemId}:${input.locationId}`)!;
  if (level.onHand !== input.expected) throw new StockError("Stock moved here since the count started. Recount this line.", "stale_count");
  const delta = input.counted - level.onHand;
  if (delta === 0) return 0;
  if (input.counted < level.reserved + level.quarantined) {
    throw new StockError(`${level.reserved + level.quarantined} units here are held or under repair; release them before counting fewer.`);
  }
  await applyLevelChange(tx, level, { onHand: delta, type: "COUNT", reason: delta > 0 ? "FOUND" : "LOST" }, actor, ref);
  await checkLowStock(tx, [input.itemId]);
  return delta;
}
