// Demo repairs, technicians and finance for the Kochi space: a technician
// with an authenticator, external contacts, repairs in every state, a paid
// repair, a bought purchase and manual entries in the finance ledger.
import { prisma } from "@/lib/db";
import { createManualEntry } from "@/lib/finance";
import { encryptMfaSecret } from "@/lib/mfa";
import { movePurchase } from "@/lib/purchases";
import {
  addExternalTechnician, addStaffTechnician, approveRepairAmount, assignTechnician, closeRepair, recordRepairPayout, recordRepairWork, reportFromIncident, reportIssue, sendRepairRequests,
} from "@/lib/repairs";

/** The demo technician's authenticator seed (development only; the e2e journeys sign in with it). */
export const DEMO_TECHNICIAN_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

type Ids = { spaceId: string; users: Map<string, string>; domain: string; passwordHash: string };

export async function seedRepairs({ spaceId, users, domain, passwordHash }: Ids) {
  const manager = { userId: users.get("meera")! };
  const staff = { userId: users.get("joel")! };
  const arun = await prisma.user.create({ data: { email: `arun${domain}`, name: "Arun Joseph", passwordHash, emailVerified: new Date(), mfaSecretEncrypted: encryptMfaSecret(DEMO_TECHNICIAN_TOTP_SECRET), mfaEnabledAt: new Date() } });
  await prisma.membership.create({ data: { spaceId, userId: arun.id, role: "TECHNICIAN" } });
  const contact = { phone: null, telegramChatId: null, preferredChannel: null, notes: null };
  const [staffTech, suresh] = await prisma.$transaction(async (tx) => [
    await addStaffTechnician(tx, spaceId, { userId: arun.id, ...contact, whatsapp: null, skills: ["electrical", "power tools", "soldering"] }, manager.userId),
    await addExternalTechnician(tx, spaceId, { name: "Suresh Electricals", email: `suresh${domain}`, ...contact, whatsapp: "+919800000001", skills: ["electrical", "power tools"], notes: "Kakkanad, open Mon to Sat" }, manager.userId),
    await addExternalTechnician(tx, spaceId, { name: "CoolAir Services", email: `coolair${domain}`, ...contact, whatsapp: null, skills: ["ac", "ventilation"] }, manager.userId),
  ]);
  const item = (sku: string) => prisma.item.findUniqueOrThrow({ where: { spaceId_sku: { spaceId, sku } }, include: { assets: { orderBy: { assetTag: "asc" } } } });

  // Waiting for an answer: the screwdriver set that came back damaged, sent to Arun and Suresh.
  const incident = await prisma.loanIncident.findFirst({ where: { spaceId, kind: "DAMAGED", status: "OPEN" } });
  if (incident) {
    const fromLoan = await prisma.$transaction((tx) => reportFromIncident(tx, { spaceId, incidentId: incident.id, severity: "MEDIUM" }, manager));
    await prisma.$transaction((tx) => sendRepairRequests(tx, { spaceId, issueId: fromLoan.id, technicianIds: [staffTech.id, suresh.id] }, manager));
  }
  // Reported by a member, waiting for a manager.
  const jigsaw = await item("JIGSAW");
  await prisma.$transaction((tx) => reportIssue(tx, { spaceId, itemId: jigsaw.id, assetId: null, title: "Blade wobbles at high speed", description: "The blade clamp feels loose and the cut drifts left.", severity: "HIGH", takeOutOfUse: false, quantity: 0, locationId: null, photos: [] }, { userId: users.get("fathima")! }));
  // Fixed, verified and paid: a soldering station with a dead heater.
  const station = await item("SOLDER-STATION");
  const paid = await prisma.$transaction((tx) => reportIssue(tx, { spaceId, itemId: station.id, assetId: station.assets[2]!.id, title: "Heater doesn't warm up", description: "Display shows 25 °C after five minutes.", severity: "MEDIUM", takeOutOfUse: true, quantity: 1, locationId: null, photos: [] }, staff));
  await prisma.$transaction((tx) => assignTechnician(tx, { spaceId, issueId: paid.id, technicianId: staffTech.id }, manager));
  await prisma.$transaction((tx) => recordRepairWork(tx, { spaceId, issueId: paid.id, remarks: "Replaced the heater element and the tip sensor; held 350 °C for 20 minutes.", partsUsed: "Heater element 60 W, tip sensor", amountAskedMinor: 150_000, photos: [], markFixed: true }, { userId: arun.id, technicianId: staffTech.id }));
  await prisma.$transaction((tx) => closeRepair(tx, { spaceId, issueId: paid.id, outcome: "FIXED", note: "Checked on the bench." }, manager));
  await prisma.$transaction((tx) => approveRepairAmount(tx, { spaceId, issueId: paid.id, amountMinor: 150_000, note: null }, manager));
  await prisma.$transaction((tx) => recordRepairPayout(tx, { spaceId, issueId: paid.id, amountMinor: 150_000, method: "UPI", reference: "UPI-430118", paidAt: new Date(Date.now() - 86_400_000), note: null }, manager));
  // Being repaired by Arun: a multimeter with a cracked jack.
  const meter = await item("MULTIMETER");
  const working = await prisma.$transaction((tx) => reportIssue(tx, { spaceId, itemId: meter.id, assetId: meter.assets[3]!.id, title: "Probe jack cracked", description: "The COM jack is loose and readings jump.", severity: "LOW", takeOutOfUse: true, quantity: 1, locationId: null, photos: [] }, staff));
  await prisma.$transaction((tx) => assignTechnician(tx, { spaceId, issueId: working.id, technicianId: staffTech.id }, manager));

  // The buy list: the jumper wires were ordered (and paid), and the books have rent and workshop fees.
  const supplier = await prisma.supplier.create({ data: { spaceId, name: "Robu.in", website: "https://robu.in" } });
  const jumpers = await prisma.purchaseItem.findFirst({ where: { spaceId, status: "APPROVED" } });
  if (jumpers) await prisma.$transaction((tx) => movePurchase(tx, { spaceId, purchaseId: jumpers.id, step: "order", payment: { amountMinor: 90_000, method: "BANK_TRANSFER", reference: "INV-2291", supplierId: supplier.id } }, manager));
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
  await prisma.$transaction((tx) => createManualEntry(tx, { spaceId, direction: "OUT", category: "RENT", amountMinor: 1_500_000, method: "BANK_TRANSFER", reference: "NEFT-88213", occurredAt: daysAgo(10), note: "Workshop rent, this month", actorId: manager.userId }));
  await prisma.$transaction((tx) => createManualEntry(tx, { spaceId, direction: "IN", category: "OTHER_INCOME", amountMinor: 600_000, method: "UPI", reference: "UPI-WS-0412", occurredAt: daysAgo(4), note: "Soldering class fees", actorId: manager.userId }));
}
