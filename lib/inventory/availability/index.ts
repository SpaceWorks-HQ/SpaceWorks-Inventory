/**
 * The inventory availability module: the only code that changes stock
 * balances, asset whereabouts and the stock ledger. Every function needs
 * the caller's interactive transaction and locks rows in a fixed order
 * (loan/transfer → Item → StockLevel → Asset). Availability never goes
 * below zero: functions throw StockError first, and database CHECK
 * constraints refuse it as a last line of defence.
 */
export { StockError, assertPositiveQuantity, type Actor, type MovementRef } from "./errors";
export { availableOf, lockItems, lockLevels } from "./levels";
export { receiveStock, adjustStock, moveStock, quarantineStock, resolveQuarantine, nextAverageCost } from "./operations";
export { reserve, releaseHolds, takeFromHolds, takeFree, putBack, recordLossWhileOut, type HoldOwner } from "./reservations";
export { addAssetToStock, takeAsset, bringBackAsset, moveAsset, changeAssetState, countAsset, lockAssets, type AssetOutcome } from "./assets";
export { applyCount } from "./counts";
export { checkLowStock, availableTotal } from "./lowStock";
export { availabilityFor, availabilityOf, levelsForItem, type ItemAvailability } from "./queries";
