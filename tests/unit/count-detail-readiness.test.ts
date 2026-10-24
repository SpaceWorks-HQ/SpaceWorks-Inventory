import { beforeEach, describe, expect, it, vi } from "vitest";
import { countDetail } from "@/lib/desk/countsDetail";
import { countReadiness } from "@/lib/desk/countReadiness";

const db = vi.hoisted(() => ({
  stockCount: { findFirst: vi.fn() },
  stockLevel: { findMany: vi.fn() },
  asset: { groupBy: vi.fn(), count: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/catalogue/locations", () => ({ locationTree: async () => [] }));
vi.mock("@/lib/desk/evidence", () => ({ namesOf: async () => new Map() }));

const line = { id: "line", itemId: "item", locationId: "shelf", expectedQty: 3, countedQty: null, countedById: null, item: { name: "Item", sku: "SKU", tracking: "QUANTITY", unit: null } };
const count = { id: "count", number: 1, status: "SUBMITTED", blind: false, categoryId: null, locationId: null, startedById: null, postedById: null, varianceThreshold: 10, scans: [] };

beforeEach(() => {
  vi.resetAllMocks();
  db.asset.groupBy.mockResolvedValue([]);
  db.asset.count.mockResolvedValue(0);
});

describe("count detail posting readiness", () => {
  it("shows stale uncounted lines without blocking, but blocks stale counted zeros", async () => {
    db.stockCount.findFirst.mockResolvedValue({ ...count, lines: [{ ...line, countedQty: 0 }, { ...line, id: "uncounted", itemId: "other" }] });
    db.stockLevel.findMany.mockResolvedValue([{ itemId: "item", locationId: "shelf", onHand: 3 }, { itemId: "other", locationId: "shelf", onHand: 4 }]);
    const detail = (await countDetail("space", "count", "manager"))!;
    expect(detail.lines.find((row) => row.id === "uncounted")).toMatchObject({ stale: true, countedQty: null });
    expect(detail.totals).toEqual({ lines: 2, counted: 1, stale: 0 });
    expect(countReadiness({ recordedLines: detail.totals.counted, staleLines: detail.totals.stale, blocked: detail.fourEyes.blocked }).postReason).toBeNull();

    db.stockLevel.findMany.mockResolvedValue([{ itemId: "item", locationId: "shelf", onHand: 4 }, { itemId: "other", locationId: "shelf", onHand: 4 }]);
    const moved = (await countDetail("space", "count", "manager"))!;
    expect(moved.totals).toEqual({ lines: 2, counted: 1, stale: 1 });
    expect(countReadiness({ recordedLines: moved.totals.counted, staleLines: moved.totals.stale, blocked: false }).postReason).toContain("refresh the stale lines");
  });

  it("shows legacy posted serialized scans as counted with a variance", async () => {
    const scans = ["one", "two"].map((assetId) => ({ assetId, locationId: "shelf", scannedById: null, asset: { itemId: "item", assetTag: assetId } }));
    db.stockCount.findFirst.mockResolvedValue({ ...count, status: "POSTED", lines: [{ ...line, item: { ...line.item, tracking: "SERIALIZED" } }], scans });
    db.stockLevel.findMany.mockResolvedValue([]);
    const detail = (await countDetail("space", "count", "manager"))!;
    expect(detail.totals).toEqual({ lines: 1, counted: 1, stale: 0 });
    expect(detail.lines[0]).toMatchObject({ expected: 3, variance: -1, scannedTags: ["one", "two"] });
  });
});
