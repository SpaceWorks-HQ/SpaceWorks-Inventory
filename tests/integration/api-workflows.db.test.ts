import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateTokenSecret } from "@/lib/apiTokens";
import { createItem } from "@/lib/catalogue/items";
import { receiveStock } from "@/lib/inventory/availability";
import { GET as loansGET, POST as loansPOST } from "@/app/api/v1/loans/route";
import { GET as loanGET } from "@/app/api/v1/loans/[id]/route";
import { POST as loanActionPOST } from "@/app/api/v1/loans/[id]/[action]/route";
import { GET as transfersGET, POST as transfersPOST } from "@/app/api/v1/transfers/route";
import { GET as transferGET } from "@/app/api/v1/transfers/[id]/route";
import { POST as transferActionPOST } from "@/app/api/v1/transfers/[id]/[action]/route";
import { GET as reportGET } from "@/app/api/v1/reports/[report]/route";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffixA = uniqueSuffix();
const suffixB = uniqueSuffix();
let a: Awaited<ReturnType<typeof seedSpace>>;
let b: Awaited<ReturnType<typeof seedSpace>>;
let key: string;
let readLoans: string;
let keyB: string;
const system = { userId: null };

async function mint(spaceId: string, ownerId: string, scopes: string[]) {
  const secret = generateTokenSecret();
  await prisma.apiToken.create({ data: { spaceId, name: "Test key", prefix: secret.prefix, secretHash: secret.secretHash, scopes, createdById: ownerId } });
  return secret.token;
}

function req(path: string, token: string, init: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost/api/v1${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function stockedItem(spaceId: string, locationId: string, name: string, quantity: number, lendable = true) {
  const item = await prisma.$transaction((tx) => createItem(tx, spaceId, { name, lendable }, system));
  await prisma.$transaction((tx) => receiveStock(tx, { spaceId, itemId: item.id, locationId, quantity }, system));
  return item;
}

beforeAll(async () => {
  a = await seedSpace(suffixA);
  b = await seedSpace(suffixB);
  key = await mint(a.space.id, a.owner.id, ["read:loans", "write:loans", "read:transfers", "write:transfers", "read:reports"]);
  readLoans = await mint(a.space.id, a.owner.id, ["read:loans"]);
  keyB = await mint(b.space.id, b.owner.id, ["read:loans", "write:loans", "read:transfers", "write:transfers"]);
});

afterAll(async () => {
  await cleanup([a.space.slug], a.domain);
  await cleanup([b.space.slug], b.domain);
});

describe("API loans", () => {
  it("requests a loan for a member, then approves it and holds the stock", async () => {
    const drill = await stockedItem(a.space.id, a.shelfA.id, "Drill", 3);
    const created = await loansPOST(req("/loans", key, { method: "POST", body: { memberId: a.membership.id, lines: [{ itemId: drill.id, quantity: 2 }], purpose: "Shelf build" } }));
    expect(created.status).toBe(201);
    const loan = (await created.json()).data;
    expect(loan).toMatchObject({ status: "REQUESTED", reference: expect.stringMatching(/^LN-\d{4}$/), borrower: { membershipId: a.membership.id, name: "Member" } });
    expect(JSON.stringify(loan)).not.toContain("@");

    const approved = await loanActionPOST(req(`/loans/${loan.id}/approve`, key, { method: "POST" }), params({ id: loan.id, action: "approve" }));
    expect(approved.status).toBe(200);
    expect((await approved.json()).data).toMatchObject({ status: "APPROVED", lines: [{ quantityApproved: 2 }] });
    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { itemId_locationId: { itemId: drill.id, locationId: a.shelfA.id } } });
    expect(level.reserved).toBe(2);

    const again = await loanActionPOST(req(`/loans/${loan.id}/approve`, key, { method: "POST" }), params({ id: loan.id, action: "approve" }));
    expect(again.status).toBe(409);
    const cancelled = await loanActionPOST(req(`/loans/${loan.id}/cancel`, key, { method: "POST", body: { reason: "Changed plans" } }), params({ id: loan.id, action: "cancel" }));
    expect((await cancelled.json()).data.status).toBe("CANCELLED");

    const list = await (await loansGET(req("/loans?status=cancelled", readLoans))).json();
    expect(list.data.map((row: { id: string }) => row.id)).toContain(loan.id);
  });

  it("needs a reason to reject and refuses unknown members, items and actions", async () => {
    const saw = await stockedItem(a.space.id, a.shelfA.id, "Saw", 1);
    const loan = (await (await loansPOST(req("/loans", key, { method: "POST", body: { memberId: a.membership.id, lines: [{ itemId: saw.id, quantity: 1 }] } }))).json()).data;
    expect((await loanActionPOST(req(`/loans/${loan.id}/reject`, key, { method: "POST", body: {} }), params({ id: loan.id, action: "reject" }))).status).toBe(400);
    const rejected = await loanActionPOST(req(`/loans/${loan.id}/reject`, key, { method: "POST", body: { reason: "Blade is blunt" } }), params({ id: loan.id, action: "reject" }));
    const rejectedBody = await rejected.json();
    expect(rejectedBody.data?.status, JSON.stringify(rejectedBody)).toBe("REJECTED");
    expect((await loanActionPOST(req(`/loans/${loan.id}/issue`, key, { method: "POST" }), params({ id: loan.id, action: "issue" }))).status).toBe(404);
    expect((await loansPOST(req("/loans", key, { method: "POST", body: { memberId: b.membership.id, lines: [{ itemId: saw.id, quantity: 1 }] } }))).status).toBe(404);
    const notLendable = await stockedItem(a.space.id, a.shelfA.id, "Resin", 5, false);
    expect((await loansPOST(req("/loans", key, { method: "POST", body: { memberId: a.membership.id, lines: [{ itemId: notLendable.id, quantity: 1 }] } }))).status).toBe(404);
    expect((await loansPOST(req("/loans", readLoans, { method: "POST", body: { memberId: a.membership.id, lines: [{ itemId: saw.id, quantity: 1 }] } }))).status).toBe(403);
  });

  it("hides loans from other spaces", async () => {
    const loan = await prisma.loan.findFirstOrThrow({ where: { spaceId: a.space.id } });
    expect((await loanGET(req(`/loans/${loan.id}`, keyB), params({ id: loan.id }))).status).toBe(404);
    expect((await loanActionPOST(req(`/loans/${loan.id}/cancel`, keyB, { method: "POST" }), params({ id: loan.id, action: "cancel" }))).status).toBe(404);
    expect((await loanGET(req(`/loans/${loan.id}`, key), params({ id: loan.id }))).status).toBe(200);
  });
});

describe("API transfers", () => {
  it("requests and approves a move between two locations", async () => {
    const glue = await stockedItem(a.space.id, a.shelfA.id, "Glue sticks", 10, false);
    const created = await transfersPOST(req("/transfers", key, { method: "POST", body: { sourceLocationId: a.shelfA.id, destinationLocationId: a.shelfB.id, lines: [{ itemId: glue.id, quantity: 4 }], reason: "Restock bench" } }));
    expect(created.status).toBe(201);
    const transfer = (await created.json()).data;
    expect(transfer).toMatchObject({ status: "REQUESTED", direction: "internal", reference: expect.stringMatching(/^TR-\d{4}$/) });
    const approved = await transferActionPOST(req(`/transfers/${transfer.id}/approve`, key, { method: "POST" }), params({ id: transfer.id, action: "approve" }));
    expect((await approved.json()).data).toMatchObject({ status: "APPROVED", lines: [{ quantityApproved: 4 }] });
    const list = await (await transfersGET(req("/transfers?direction=internal", key))).json();
    expect(list.data.map((row: { id: string }) => row.id)).toContain(transfer.id);
    expect((await transferGET(req(`/transfers/${transfer.id}`, keyB), params({ id: transfer.id }))).status).toBe(404);
    expect((await transferActionPOST(req(`/transfers/${transfer.id}/cancel`, keyB, { method: "POST" }), params({ id: transfer.id, action: "cancel" }))).status).toBe(404);
  });

  it("pushes stock to another space, which sees it as incoming but can't approve it", async () => {
    const wire = await stockedItem(a.space.id, a.shelfA.id, "Hook-up wire", 6, false);
    const created = await transfersPOST(req("/transfers", key, { method: "POST", body: { destinationSpace: b.space.slug, sourceLocationId: a.shelfA.id, lines: [{ itemId: wire.id, quantity: 2 }] } }));
    expect(created.status).toBe(201);
    const transfer = (await created.json()).data;
    expect(transfer.direction).toBe("out");
    const incoming = await (await transferGET(req(`/transfers/${transfer.id}`, keyB), params({ id: transfer.id }))).json();
    expect(incoming.data.direction).toBe("in");
    expect((await transferActionPOST(req(`/transfers/${transfer.id}/approve`, keyB, { method: "POST" }), params({ id: transfer.id, action: "approve" }))).status).toBe(403);
    expect((await transfersPOST(req("/transfers", key, { method: "POST", body: { destinationSpace: "no-such-space", sourceLocationId: a.shelfA.id, lines: [{ itemId: wire.id, quantity: 1 }] } }))).status).toBe(404);
  });
});

describe("API reports", () => {
  it("returns valuation, low stock and overdue reports", async () => {
    const valuation = await reportGET(req("/reports/valuation", key), params({ report: "valuation" }));
    expect(valuation.status).toBe(200);
    expect((await valuation.json()).data).toMatchObject({ currency: "INR" });
    expect((await reportGET(req("/reports/low-stock", key), params({ report: "low-stock" }))).status).toBe(200);
    expect(Array.isArray((await (await reportGET(req("/reports/overdue", key), params({ report: "overdue" }))).json()).data)).toBe(true);
    expect((await reportGET(req("/reports/nope", key), params({ report: "nope" }))).status).toBe(404);
    expect((await reportGET(req("/reports/valuation", readLoans), params({ report: "valuation" }))).status).toBe(403);
  });
});
