import "./localEnv";
import { PrismaClient } from "@prisma/client";

// The codes printed under the QR labels. At the desk a person types them off
// the label when the camera can't read it; the journeys read them from the
// seeded database instead (Playwright has no physical labels to look at).
const prisma = new PrismaClient();

/** The record id at the end of the current page's path. */
export function recordId(url: string) {
  return new URL(url).pathname.split("/").pop()!;
}

/** Labels to scan when handing a loan over (`issue`) or taking it back (`return`). */
export async function loanLabelCodes(loanId: string, step: "issue" | "return") {
  const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId }, include: { lines: { include: { item: true, asset: true } } } });
  const codes: string[] = [];
  for (const line of loan.lines) {
    if (step === "return" && line.quantityIssued - line.quantityReturned - line.quantityDamaged - line.quantityLost - line.quantityConsumed <= 0) continue;
    if (line.item.tracking !== "SERIALIZED") codes.push(line.item.qrCode);
    else if (step === "return") codes.push(line.asset!.qrCode);
    else codes.push(...(await availableAssetCodes(line.itemId, line.quantityApproved)));
  }
  return [...new Set(codes)];
}

/** Labels to scan when dispatching a transfer at its source, or receiving it at its destination. */
export async function transferLabelCodes(transferId: string, step: "dispatch" | "receive") {
  const transfer = await prisma.transfer.findUniqueOrThrow({ where: { id: transferId }, include: { lines: { include: { item: true } } } });
  const codes: string[] = [];
  for (const line of transfer.lines) {
    if (line.item.tracking === "SERIALIZED") {
      codes.push(...(await availableAssetCodes(line.itemId, line.quantityApproved)));
      continue;
    }
    const itemId = step === "receive" && line.destItemId ? line.destItemId : line.itemId;
    codes.push((await prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: { qrCode: true } })).qrCode);
  }
  return [...new Set(codes)];
}

/** The label code of an item in a space, by SKU. */
export async function itemLabelCode(spaceSlug: string, sku: string) {
  const item = await prisma.item.findFirstOrThrow({ where: { sku, space: { slug: spaceSlug } }, select: { qrCode: true } });
  return item.qrCode;
}

async function availableAssetCodes(itemId: string, count: number) {
  const assets = await prisma.asset.findMany({ where: { itemId, status: "AVAILABLE" }, orderBy: { assetTag: "asc" }, take: count, select: { qrCode: true } });
  return assets.map((asset) => asset.qrCode);
}
