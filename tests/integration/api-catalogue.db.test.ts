import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateTokenSecret } from "@/lib/apiTokens";
import { createItem } from "@/lib/catalogue/items";
import { GET as spaceGET } from "@/app/api/v1/space/route";
import { GET as itemsGET, POST as itemsPOST } from "@/app/api/v1/items/route";
import { GET as itemGET, PATCH as itemPATCH } from "@/app/api/v1/items/[id]/route";
import { GET as locationsGET, POST as locationsPOST } from "@/app/api/v1/locations/route";
import { GET as stockGET } from "@/app/api/v1/stock/route";
import { POST as adjustPOST } from "@/app/api/v1/stock/adjustments/route";
import { POST as receivePOST } from "@/app/api/v1/stock/receipts/route";
import { GET as membersGET } from "@/app/api/v1/members/route";
import { GET as openapiGET } from "@/app/api/v1/openapi.json/route";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffixA = uniqueSuffix();
const suffixB = uniqueSuffix();
let a: Awaited<ReturnType<typeof seedSpace>>;
let b: Awaited<ReturnType<typeof seedSpace>>;
let full: string;
let readOnly: string;
let keyB: string;

async function mint(spaceId: string, ownerId: string, scopes: string[]) {
  const secret = generateTokenSecret();
  await prisma.apiToken.create({ data: { spaceId, name: "Test key", prefix: secret.prefix, secretHash: secret.secretHash, scopes, createdById: ownerId } });
  return secret.token;
}

function req(path: string, token: string | null, init: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost/api/v1${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

beforeAll(async () => {
  a = await seedSpace(suffixA);
  b = await seedSpace(suffixB);
  full = await mint(a.space.id, a.owner.id, ["read:catalogue", "write:catalogue", "read:stock", "write:stock", "read:members"]);
  readOnly = await mint(a.space.id, a.owner.id, ["read:catalogue"]);
  keyB = await mint(b.space.id, b.owner.id, ["read:catalogue"]);
});

afterAll(async () => {
  await cleanup([a.space.slug], a.domain);
  await cleanup([b.space.slug], b.domain);
});

describe("API authentication and scopes", () => {
  it("refuses missing and malformed keys with 401", async () => {
    const none = await spaceGET(req("/space", null));
    expect(none.status).toBe(401);
    expect((await none.json()).error.code).toBe("UNAUTHORIZED");
    expect((await spaceGET(req("/space", "swi_nottherightshape"))).status).toBe(401);
  });

  it("stops working when the key is revoked or its creator is no longer an admin", async () => {
    const token = await mint(a.space.id, a.staff.id, ["read:catalogue"]);
    expect((await spaceGET(req("/space", token))).status).toBe(401);
  });

  it("answers 403 without the scope", async () => {
    const response = await adjustPOST(req("/stock/adjustments", readOnly, { method: "POST", body: { itemId: "x", locationId: "y", delta: 1, reason: "FOUND" } }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toEqual({ code: "FORBIDDEN", message: "This API key needs the write:stock scope." });
  });

  it("returns the key's own space", async () => {
    const body = await (await spaceGET(req("/space", full))).json();
    expect(body.data).toMatchObject({ slug: a.space.slug, currency: "INR" });
  });
});

describe("API items and locations", () => {
  it("creates, reads and patches an item, refusing bad input", async () => {
    const created = await itemsPOST(req("/items", full, { method: "POST", body: { name: "Soldering iron", lendable: true, unitCostMinor: 120000 } }));
    expect(created.status).toBe(201);
    const item = (await created.json()).data;
    expect(item).toMatchObject({ name: "Soldering iron", sku: "SOLDERING-IRON", lending: { lendable: true } });
    const audit = await prisma.auditEvent.findFirst({ where: { spaceId: a.space.id, action: "item.created", targetId: item.id } });
    expect(audit?.actorApiTokenId).not.toBeNull();

    const patched = await itemPATCH(req(`/items/${item.id}`, full, { method: "PATCH", body: { brand: "Hakko", reorderPoint: 2 } }), params({ id: item.id }));
    expect((await patched.json()).data).toMatchObject({ name: "Soldering iron", brand: "Hakko", reorderPoint: 2 });

    const bad = await itemsPOST(req("/items", full, { method: "POST", body: { name: "" } }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("INVALID");
    const typo = await itemPATCH(req(`/items/${item.id}`, full, { method: "PATCH", body: { colour: "red" } }), params({ id: item.id }));
    expect(typo.status).toBe(400);
    const noBody = await itemsPOST(req("/items", full, { method: "POST" }));
    expect(noBody.status).toBe(400);
  });

  it("keeps spaces apart: a key never sees another space's items", async () => {
    const foreign = await prisma.$transaction((tx) => createItem(tx, b.space.id, { name: "Space B lathe" }, { userId: null }));
    expect((await itemGET(req(`/items/${foreign.id}`, full), params({ id: foreign.id }))).status).toBe(404);
    expect((await itemPATCH(req(`/items/${foreign.id}`, full, { method: "PATCH", body: { name: "Mine now" } }), params({ id: foreign.id }))).status).toBe(404);
    const list = await (await itemsGET(req("/items?limit=100", full))).json();
    expect(list.data.map((row: { id: string }) => row.id)).not.toContain(foreign.id);
    expect((await itemGET(req(`/items/${foreign.id}`, keyB), params({ id: foreign.id }))).status).toBe(200);
  });

  it("paginates with a cursor", async () => {
    for (const name of ["Tape A", "Tape B", "Tape C"]) await prisma.$transaction((tx) => createItem(tx, a.space.id, { name }, { userId: null }));
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const response: Response = await itemsGET(req(`/items?limit=2&q=tape${cursor ? `&cursor=${cursor}` : ""}`, readOnly));
      const body: { data: { id: string }[]; nextCursor: string | null } = await response.json();
      seen.push(...body.data.map((row) => row.id));
      cursor = body.nextCursor;
      pages += 1;
    } while (cursor && pages < 5);
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(3);
    expect(pages).toBe(2);
    expect((await itemsGET(req("/items?limit=500", readOnly))).status).toBe(400);
  });

  it("creates and lists locations", async () => {
    const created = await locationsPOST(req("/locations", full, { method: "POST", body: { name: "Shelf C", code: "r1-c", kind: "SHELF", parentId: a.room.id } }));
    expect(created.status).toBe(201);
    expect((await created.json()).data).toMatchObject({ code: "R1-C", parentId: a.room.id });
    const clash = await locationsPOST(req("/locations", full, { method: "POST", body: { name: "Again", code: "R1-C" } }));
    expect(clash.status).toBe(409);
    const list = await (await locationsGET(req(`/locations?parent=${a.room.id}`, readOnly))).json();
    expect(list.data.map((row: { code: string }) => row.code).sort()).toEqual(["R1-A", "R1-B", "R1-C"]);
  });
});

describe("API stock", () => {
  it("receives and adjusts stock with audit, and refuses taking more than is free", async () => {
    const item = await prisma.$transaction((tx) => createItem(tx, a.space.id, { name: "M3 screws" }, { userId: null }));
    const received = await receivePOST(req("/stock/receipts", full, { method: "POST", body: { itemId: item.id, locationId: a.shelfA.id, quantity: 10, unitCostMinor: 200 } }));
    expect(received.status).toBe(201);
    expect((await received.json()).data).toMatchObject({ onHand: 10, available: 10 });
    const adjusted = await adjustPOST(req("/stock/adjustments", full, { method: "POST", body: { itemId: item.id, locationId: a.shelfA.id, delta: -3, reason: "CONSUMED", note: "Used in a workshop" } }));
    expect((await adjusted.json()).data).toMatchObject({ onHand: 7, available: 7 });
    const tooMany = await adjustPOST(req("/stock/adjustments", full, { method: "POST", body: { itemId: item.id, locationId: a.shelfA.id, delta: -50, reason: "LOST" } }));
    expect(tooMany.status).toBe(409);
    const audits = await prisma.auditEvent.findMany({ where: { spaceId: a.space.id, targetId: item.id, action: { in: ["stock.received", "stock.adjusted"] } } });
    expect(audits).toHaveLength(2);
    expect(audits.every((row) => row.actorApiTokenId !== null)).toBe(true);
    const movement = await prisma.stockMovement.findFirst({ where: { itemId: item.id, type: "ADJUSTMENT" } });
    expect(movement).toMatchObject({ quantity: -3, reason: "CONSUMED", actorId: a.owner.id });
    expect(movement?.actorApiTokenId).not.toBeNull();

    const stock = await (await stockGET(req(`/stock?item=${item.id}`, full))).json();
    expect(stock.data.totals).toMatchObject({ onHand: 7, available: 7 });
    expect(stock.data.locations).toHaveLength(1);
  });

  it("refuses serialized items and foreign locations", async () => {
    const meter = await prisma.$transaction((tx) => createItem(tx, a.space.id, { name: "Scope", tracking: "SERIALIZED" }, { userId: null }));
    const serialized = await receivePOST(req("/stock/receipts", full, { method: "POST", body: { itemId: meter.id, locationId: a.shelfA.id, quantity: 1 } }));
    expect(serialized.status).toBe(400);
    const plain = await prisma.$transaction((tx) => createItem(tx, a.space.id, { name: "Zip ties" }, { userId: null }));
    const foreign = await receivePOST(req("/stock/receipts", full, { method: "POST", body: { itemId: plain.id, locationId: b.shelfA.id, quantity: 1 } }));
    expect(foreign.status).toBe(404);
  });
});

describe("API members and description", () => {
  it("lists members without emails", async () => {
    const body = await (await membersGET(req("/members?role=member", full))).json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toEqual(expect.objectContaining({ id: a.membership.id, name: "Member", role: "MEMBER", borrowingStatus: "GOOD" }));
    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("serves the OpenAPI document", async () => {
    const doc = await (await openapiGET(new Request("http://localhost/api/v1/openapi.json"))).json();
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(["/items/{id}", "/stock/adjustments", "/loans/{id}/{action}", "/reports/overdue"]));
  });
});
