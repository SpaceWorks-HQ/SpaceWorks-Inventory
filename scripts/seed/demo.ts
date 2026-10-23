// Demo data for local review and README screenshots: two makerspaces with
// people in every role, the sample inventory, loans in every state, a
// transfer in transit between the spaces, an open count and a buy list.
// Run with `DEMO_PASSWORD=... npm run db:seed:demo` (bundled by scripts/seed-demo.mjs).
// Idempotent: re-running replaces the demo spaces and @tinkerspace.test users.
import bcrypt from "bcryptjs";
import type { SpaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSpaceWithDefaults } from "@/lib/spaces";
import { loadSampleData } from "@/lib/sampleData";
import { createLocation } from "@/lib/catalogue/locations";
import { approveLoan, issueLoan, rejectLoan, requestLoan, returnLoan } from "@/lib/lending/workflow";
import { approveTransfer, dispatchTransfer, requestTransfer } from "@/lib/transfers/workflow";
import { startCount } from "@/lib/counts";
import { createPurchase, movePurchase } from "@/lib/purchases";
import type { StoredImage } from "@/lib/storage";

const DOMAIN = "@tinkerspace.test";
const SPACES = [
  { slug: "tinkerspace-kochi", name: "TinkerSpace Kochi", tagline: "Tools, parts and kits for Kochi's makers." },
  { slug: "maker-lab-thrissur", name: "Maker Lab Thrissur", tagline: "The Thrissur chapter's workshop." },
];
const PEOPLE: { key: string; name: string; role: SpaceRole }[] = [
  { key: "anjali", name: "Anjali Menon", role: "OWNER" },
  { key: "rahul", name: "Rahul Varghese", role: "ADMIN" },
  { key: "meera", name: "Meera Nair", role: "MANAGER" },
  { key: "joel", name: "Joel Thomas", role: "STAFF" },
  { key: "fathima", name: "Fathima Rahman", role: "MEMBER" },
  { key: "vivek", name: "Vivek Pillai", role: "MEMBER" },
  { key: "nisha", name: "Nisha Kurian", role: "MEMBER" },
];

/** A placeholder evidence photo record (demo only; no image bytes are stored). */
function photo(spaceId: string): StoredImage {
  return { storageKey: `spaces/${spaceId}/evidence/${crypto.randomUUID()}/evidence.webp`, contentType: "image/webp", width: 1200, height: 900, sizeBytes: 182_000, sha256: "0".repeat(64) };
}
const proof = (spaceId: string, remarks: string, codes: string[] = []) => ({ photos: [photo(spaceId)], remarks, scannedCodes: codes });

export async function seedDemo(password: string) {
  if (process.env.NODE_ENV === "production") throw new Error("seed-demo is for local development only.");
  await prisma.loan.deleteMany({ where: { space: { slug: { in: SPACES.map((s) => s.slug) } } } });
  await prisma.space.deleteMany({ where: { slug: { in: SPACES.map((s) => s.slug) } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  const passwordHash = await bcrypt.hash(password, 12);
  const users = new Map<string, string>();
  for (const person of PEOPLE) {
    const user = await prisma.user.create({ data: { email: `${person.key}${DOMAIN}`, name: person.name, passwordHash, emailVerified: new Date(), isInstanceAdmin: person.key === "anjali" } });
    users.set(person.key, user.id);
  }
  const owner = users.get("anjali")!;
  const [kochi, thrissur] = await prisma.$transaction(async (tx) => Promise.all(SPACES.map((s) => createSpaceWithDefaults(tx, { name: s.name, slug: s.slug, tagline: s.tagline, ownerId: owner }))));
  for (const person of PEOPLE.slice(1)) {
    await prisma.membership.create({ data: { spaceId: kochi!.id, userId: users.get(person.key)!, role: person.role, memberNumber: person.role === "MEMBER" ? `TSK-${1000 + PEOPLE.indexOf(person)}` : null } });
  }
  await prisma.membership.create({ data: { spaceId: thrissur!.id, userId: users.get("meera")!, role: "MANAGER" } });
  await prisma.space.update({
    where: { id: kochi!.id },
    data: { setupCompletedAt: new Date(), publicCatalogue: true, selfCheckoutEnabled: true, selfJoin: true, depositMode: "PER_ITEM", depositMinor: 0, payLaterEnabled: true, address: "Kakkanad, Kochi" },
  });
  await prisma.space.update({ where: { id: thrissur!.id }, data: { setupCompletedAt: new Date() } });
  await prisma.$transaction((tx) => loadSampleData(tx, kochi!.id, owner), { timeout: 60_000 });
  await prisma.item.updateMany({ where: { spaceId: kochi!.id, sku: { in: ["DRILL-CORDLESS", "JIGSAW"] } }, data: { depositMinor: 100_000 } });
  const thrissurShelf = await prisma.$transaction((tx) => createLocation(tx, thrissur!.id, { name: "Intake shelf", code: "IN", kind: "SHELF" }, { userId: owner }));

  const item = async (sku: string) => prisma.item.findUniqueOrThrow({ where: { spaceId_sku: { spaceId: kochi!.id, sku } }, include: { assets: { orderBy: { assetTag: "asc" } } } });
  const staff = { userId: users.get("joel")! };
  const ask = (who: string, lines: { sku: string; quantity: number }[], purpose: string) => prisma.$transaction(async (tx) => {
    const resolved = await Promise.all(lines.map(async (l) => ({ itemId: (await item(l.sku)).id, quantity: l.quantity })));
    return requestLoan(tx, { spaceId: kochi!.id, borrowerId: users.get(who)!, lines: resolved, purpose, neededFrom: null }, { userId: users.get(who)! });
  });
  const approve = (loanId: string) => prisma.$transaction((tx) => approveLoan(tx, { spaceId: kochi!.id, loanId, quantities: null }, staff));
  const issue = (loanId: string, codes: string[]) => prisma.$transaction((tx) => issueLoan(tx, { spaceId: kochi!.id, loanId, scannedCodes: codes, evidence: proof(kochi!.id, "Checked and working", codes) }, staff));

  // Waiting for approval.
  await ask("vivek", [{ sku: "ESP32-DEVKIT", quantity: 2 }, { sku: "BREADBOARD", quantity: 2 }], "Weather station workshop");
  await ask("nisha", [{ sku: "CALIPER", quantity: 1 }], "Measuring parts for a drone frame");
  // Ready to collect.
  const ready = await ask("fathima", [{ sku: "ARDUINO-UNO", quantity: 1 }, { sku: "WIRE-STRIPPER", quantity: 1 }], "Line follower robot");
  await approve(ready.id);
  // On loan, one overdue.
  const multimeter = await item("MULTIMETER");
  const onLoan = await ask("fathima", [{ sku: "MULTIMETER", quantity: 1 }, { sku: "PLIERS-NOSE", quantity: 1 }], "Repair café");
  await approve(onLoan.id);
  await issue(onLoan.id, [multimeter.assets[0]!.qrCode, (await item("PLIERS-NOSE")).qrCode]);
  const drill = await item("DRILL-CORDLESS");
  const overdue = await ask("vivek", [{ sku: "DRILL-CORDLESS", quantity: 1 }], "Shelf install at home");
  await approve(overdue.id);
  const { payLaterForLoan } = await import("@/lib/payments/charges");
  await prisma.$transaction((tx) => payLaterForLoan(tx, { loanId: overdue.id, payerId: users.get("vivek")! }));
  await issue(overdue.id, [drill.assets[0]!.qrCode]);
  await prisma.loan.update({ where: { id: overdue.id }, data: { dueAt: new Date(Date.now() - 3 * 86_400_000) } });
  // Returned, and one closed with a damaged unit.
  const station = await item("SOLDER-STATION");
  const done = await ask("nisha", [{ sku: "SOLDER-STATION", quantity: 1 }], "Soldering class");
  await approve(done.id);
  await issue(done.id, [station.assets[0]!.qrCode]);
  const doneLine = await prisma.loanLine.findFirstOrThrow({ where: { loanId: done.id } });
  await prisma.$transaction((tx) => returnLoan(tx, { spaceId: kochi!.id, loanId: done.id, scannedCodes: [station.assets[0]!.qrCode], lines: [{ lineId: doneLine.id, returned: 1, damaged: 0, lost: 0 }], evidence: proof(kochi!.id, "Tip cleaned, all good") }, staff));
  const damaged = await ask("vivek", [{ sku: "SCREWDRIVER-SET", quantity: 1 }], "Laptop repair");
  await approve(damaged.id);
  const screwdrivers = await item("SCREWDRIVER-SET");
  await issue(damaged.id, [screwdrivers.qrCode]);
  const damagedLine = await prisma.loanLine.findFirstOrThrow({ where: { loanId: damaged.id } });
  await prisma.$transaction((tx) => returnLoan(tx, { spaceId: kochi!.id, loanId: damaged.id, scannedCodes: [screwdrivers.qrCode], lines: [{ lineId: damagedLine.id, returned: 0, damaged: 1, lost: 0 }], evidence: proof(kochi!.id, "Two bits missing from the set") }, staff));
  const rejected = await ask("nisha", [{ sku: "JIGSAW", quantity: 1 }], "Cutting plywood");
  await prisma.$transaction((tx) => rejectLoan(tx, { spaceId: kochi!.id, loanId: rejected.id, reason: "The jigsaw is booked for the furniture workshop this week." }, staff));

  // A transfer in transit to Thrissur and one waiting for approval.
  const servos = await item("SERVO-SG90");
  const elab = await prisma.location.findFirstOrThrow({ where: { spaceId: kochi!.id, code: "ELAB-B3" } });
  const manager = { userId: users.get("meera")! };
  const moving = await prisma.$transaction((tx) => requestTransfer(tx, { sourceSpaceId: kochi!.id, destSpaceId: thrissur!.id, sourceLocationId: elab.id, destLocationId: thrissurShelf.id, initiatedBySpaceId: thrissur!.id, lines: [{ itemId: servos.id, quantity: 6 }], reason: "Robotics camp in Thrissur", neededBy: new Date(Date.now() + 5 * 86_400_000) }, manager));
  await prisma.$transaction((tx) => approveTransfer(tx, { transferId: moving.id, actingSpaceId: kochi!.id, quantities: null }, manager));
  await prisma.$transaction((tx) => dispatchTransfer(tx, { transferId: moving.id, actingSpaceId: kochi!.id, scannedCodes: [servos.qrCode], carrier: "KSRTC parcel", trackingRef: "KP-44120", expectedAt: new Date(Date.now() + 86_400_000), evidence: proof(kochi!.id, "Packed in a padded box", [servos.qrCode]) }, staff));
  const pla = await item("PLA-BLACK");
  const cabinet = await prisma.location.findFirstOrThrow({ where: { spaceId: kochi!.id, code: "WS-CAB" } });
  const shelf = await prisma.location.findFirstOrThrow({ where: { spaceId: kochi!.id, code: "ELAB-SA" } });
  await prisma.$transaction((tx) => requestTransfer(tx, { sourceSpaceId: kochi!.id, destSpaceId: kochi!.id, sourceLocationId: cabinet.id, destLocationId: shelf.id, initiatedBySpaceId: kochi!.id, lines: [{ itemId: pla.id, quantity: 2 }], reason: "Printer corner restock", neededBy: null }, staff));

  // An open count and the buy list.
  await prisma.$transaction((tx) => startCount(tx, { spaceId: kochi!.id, name: "Electronics lab, monthly", locationId: elab.parentId, categoryId: null, blind: true, actorId: users.get("meera")! }));
  const jumpers = await item("JUMPER-MM");
  const order = await prisma.$transaction((tx) => createPurchase(tx, { spaceId: kochi!.id, itemId: jumpers.id, name: "", quantity: 10, supplierId: null, unitCostMinor: 9000, link: null, note: "Running low before the workshop" }, staff));
  await prisma.$transaction((tx) => movePurchase(tx, { spaceId: kochi!.id, purchaseId: order.id, step: "approve" }, manager));
  await prisma.$transaction((tx) => createPurchase(tx, { spaceId: kochi!.id, itemId: null, name: "Laser cutter honeycomb bed", quantity: 1, supplierId: null, unitCostMinor: 1_250_000, link: null, note: null }, staff));
  return { spaces: SPACES.map((s) => s.slug), users: PEOPLE.map((p) => `${p.key}${DOMAIN} (${p.role})`) };
}
