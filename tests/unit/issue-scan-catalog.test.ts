import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueScanCatalog } from "@/lib/desk/loansDetail";

const db = vi.hoisted(() => ({ asset: { findMany: vi.fn() }, container: { findMany: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));

type Asset = { spaceId: string; itemId: string; status: string; qrCode: string; assetTag: string; item: { name: string } };
type Query = { where: { spaceId: string; itemId: { in: string[] }; status?: string | { not: string } }; take: number };

beforeEach(() => {
  vi.resetAllMocks();
  db.container.findMany.mockResolvedValue([]);
});

describe("issue scan catalogue limits", () => {
  it("keeps available tags eligible when more than 500 unavailable tags sort before them", async () => {
    const asset = { spaceId: "space", itemId: "drill", status: "RESERVED", item: { name: "Drill" } };
    const unavailable: Asset[] = Array.from({ length: 501 }, (_, i) => ({ ...asset, qrCode: `busy-${i}`, assetTag: `A-${String(i).padStart(3, "0")}` }));
    const available: Asset = { ...asset, status: "AVAILABLE", qrCode: "free", assetTag: "Z-001" };
    const rows = [...unavailable, available, { ...available, spaceId: "foreign", qrCode: "foreign" }, { ...available, itemId: "other", qrCode: "other" }];
    db.asset.findMany.mockImplementation(async ({ where, take }: Query) => rows
      .filter((row) => row.spaceId === where.spaceId && where.itemId.in.includes(row.itemId))
      .filter((row) => !where.status || (typeof where.status === "string" ? row.status === where.status : row.status !== where.status.not))
      .sort((a, b) => a.assetTag.localeCompare(b.assetTag)).slice(0, take));

    const catalog = await issueScanCatalog("space", ["drill"]);
    expect(catalog.assets).toEqual({ free: { itemId: "drill", label: "Drill · Z-001" } });
    expect(Object.keys(catalog.unavailable)).toHaveLength(500);
    expect(catalog.unavailable["busy-0"]).toBe("A-000");
    expect(catalog.unavailable["busy-500"]).toBeUndefined();
    expect(db.asset.findMany).toHaveBeenCalledTimes(2);
    expect(db.asset.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { spaceId: "space", itemId: { in: ["drill"] }, status: "AVAILABLE" }, take: 500 }));
    expect(db.asset.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { spaceId: "space", itemId: { in: ["drill"] }, status: { not: "AVAILABLE" } }, take: 500 }));
  });

  it("skips both asset queries when the loan has no serialized items", async () => {
    expect(await issueScanCatalog("space", [])).toEqual({ assets: {}, containers: [], unavailable: {} });
    expect(db.asset.findMany).not.toHaveBeenCalled();
    expect(db.container.findMany).toHaveBeenCalledTimes(1);
  });
});
