import "server-only";

import type { RepairIssue, Technician } from "@prisma/client";
import { repairRef } from "@/lib/catalogue/references";
import type { Tx } from "@/lib/db";
import { escapeHtml, renderNotificationEmail } from "@/lib/email/templates";
import { notifyUsers } from "@/lib/notify";
import { enqueueEmail, enqueueRepairChat, enqueueRepairRequest } from "@/lib/outbox";
import { chatChannels } from "./chat";
import { repairPath } from "./common";
import { repairLinkUrl } from "./tokens";

/**
 * Tell technicians about repairs on every channel they have: email always
 * (outbox), WhatsApp and Telegram when the space has that provider and the
 * contact has a number or chat ID, and the in-app inbox for members.
 * External technicians get their own link; members get a link into the app.
 */

type Space = { id: string; slug: string; name: string };
type IssueFacts = Pick<RepairIssue, "id" | "number" | "title" | "severity"> & { itemName: string };

const base = () => (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");

/** Send one repair request. Returns the channels used, for the request row and the timeline. */
export async function sendRequestMessages(tx: Tx, space: Space, issue: IssueFacts, technician: Technician, link: { token: string | null; expiresAt: Date }, assigned = false): Promise<string[]> {
  const channels: string[] = [];
  const reference = repairRef(issue.number);
  const summary = `${issue.itemName}: ${issue.title}`;
  const url = link.token ? repairLinkUrl(link.token) : `${base()}${repairPath(space.slug, issue.id)}`;
  if (technician.kind === "STAFF" && technician.userId) {
    const title = assigned ? `Repair ${reference} is yours: ${summary}` : `Repair request ${reference}: ${summary}`;
    await notifyUsers(tx, space.id, [technician.userId], { kind: assigned ? "repair.assigned" : "repair.requested", title: title.slice(0, 200), body: assigned ? "Record your fix notes, photos and the amount you ask on the repair." : "Accept it if you can take it. The first technician to accept gets the job.", url: repairPath(space.slug, issue.id), email: true });
    channels.push("INBOX", "EMAIL");
  } else if (technician.email && link.token) {
    await enqueueRepairRequest(tx, { spaceId: space.id, to: technician.email, spaceName: space.name, reference, itemName: issue.itemName.slice(0, 200), title: issue.title.slice(0, 200), severity: issue.severity, linkUrl: url, expiresAt: link.expiresAt, assigned });
    channels.push("EMAIL");
  }
  const chat = await chatChannels(tx, space.id);
  const text = assigned ? `Repair ${reference} from ${space.name} is assigned to you: ${summary}. Open it: ${url}` : `Repair request ${reference} from ${space.name}: ${summary}. Open it to accept or decline: ${url}`;
  if (chat.whatsapp && technician.whatsapp) {
    await enqueueRepairChat(tx, { spaceId: space.id, channel: "WHATSAPP", to: technician.whatsapp, text, expiresAt: link.expiresAt });
    channels.push("WHATSAPP");
  }
  if (chat.telegram && technician.telegramChatId) {
    await enqueueRepairChat(tx, { spaceId: space.id, channel: "TELEGRAM", to: technician.telegramChatId, text, expiresAt: link.expiresAt });
    channels.push("TELEGRAM");
  }
  return channels;
}

/** A plain update to a technician (taken by someone else, reopened, paid). Never carries a link for external technicians. */
export async function tellTechnician(tx: Tx, space: Space, issueId: string, technician: Pick<Technician, "kind" | "userId" | "email">, notice: { kind: string; title: string; body: string }) {
  if (technician.kind === "STAFF" && technician.userId) {
    await notifyUsers(tx, space.id, [technician.userId], { kind: notice.kind, title: notice.title, body: notice.body, url: repairPath(space.slug, issueId), email: true });
    return;
  }
  if (!technician.email) return;
  const rendered = renderNotificationEmail({ title: notice.title, bodyHtml: `${escapeHtml(notice.body)}<br><br>${escapeHtml(space.name)}` });
  await enqueueEmail(tx, { spaceId: space.id, to: technician.email, ...rendered });
}
