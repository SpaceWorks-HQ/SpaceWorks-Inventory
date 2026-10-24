import "server-only";

import type { TechnicianChannel } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { canWorkRepairs } from "@/lib/roles";

/**
 * The space's technician directory: members (Technician, Staff or Inventory
 * manager role) and external contacts. Managed by inventory managers;
 * every change is audited (field names only, never contact details).
 */

export type TechnicianInput = {
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  telegramChatId: string | null;
  skills: string[];
  preferredChannel: TechnicianChannel | null;
  notes: string | null;
};

/** Trimmed, lower-case, unique skill tags ("electrical", "3d printers"). */
export function normaliseSkills(skills: string[]) {
  return [...new Set(skills.map((skill) => skill.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))].slice(0, 12).map((skill) => skill.slice(0, 40));
}

function checkContact(input: TechnicianInput) {
  if (!input.name.trim()) throw new DomainError("Enter the technician's name.");
  if (input.preferredChannel === "WHATSAPP" && !input.whatsapp) throw new DomainError("Add a WhatsApp number to prefer WhatsApp.");
  if (input.preferredChannel === "TELEGRAM" && !input.telegramChatId) throw new DomainError("Add a Telegram chat ID to prefer Telegram.");
}

function data(input: TechnicianInput) {
  return {
    name: input.name.trim().slice(0, 120),
    email: input.email?.trim().toLowerCase() || null,
    phone: input.phone?.trim() || null,
    whatsapp: input.whatsapp?.trim() || null,
    telegramChatId: input.telegramChatId?.trim() || null,
    skills: normaliseSkills(input.skills),
    preferredChannel: input.preferredChannel,
    notes: input.notes?.trim().slice(0, 1000) || null,
  };
}

/** An external technician: no account; they get a link per repair request. Needs an email. */
export async function addExternalTechnician(tx: Tx, spaceId: string, input: TechnicianInput, actorId: string) {
  checkContact(input);
  if (!input.email) throw new DomainError("Add an email address: every request is emailed.");
  const technician = await tx.technician.create({ data: { spaceId, kind: "EXTERNAL", ...data(input) } });
  await recordAuditEvent({ client: tx, action: "technician.added", spaceId, actorId, targetType: "Technician", targetId: technician.id, metadata: { kind: "EXTERNAL" } });
  return technician;
}

/** A member of the space who repairs things; their email comes from their account. */
export async function addStaffTechnician(tx: Tx, spaceId: string, input: { userId: string } & Omit<TechnicianInput, "name" | "email">, actorId: string) {
  const membership = await tx.membership.findUnique({ where: { userId_spaceId: { userId: input.userId, spaceId } }, include: { user: { select: { name: true, email: true } } } });
  if (!membership || membership.status !== "ACTIVE" || !canWorkRepairs(membership)) throw new DomainError("Choose an active member with the Technician, Staff or Inventory manager role.");
  if (await tx.technician.findUnique({ where: { spaceId_userId: { spaceId, userId: input.userId } }, select: { id: true } })) throw new DomainError("They're already in the directory.", "conflict");
  const values = data({ ...input, name: membership.user.name ?? membership.user.email, email: membership.user.email });
  checkContact({ ...input, name: values.name, email: values.email });
  const technician = await tx.technician.create({ data: { spaceId, kind: "STAFF", userId: input.userId, ...values } });
  await recordAuditEvent({ client: tx, action: "technician.added", spaceId, actorId, targetType: "Technician", targetId: technician.id, metadata: { kind: "STAFF" } });
  return technician;
}

export async function updateTechnician(tx: Tx, spaceId: string, technicianId: string, input: TechnicianInput, actorId: string) {
  const current = await tx.technician.findFirst({ where: { id: technicianId, spaceId } });
  if (!current) throw new DomainError("That technician wasn't found.", "not_found");
  checkContact(input);
  // A staff technician's name and email follow their account.
  const values = data(input);
  const next = current.kind === "STAFF" ? { ...values, name: current.name, email: current.email } : values;
  if (current.kind === "EXTERNAL" && !next.email) throw new DomainError("Add an email address: every request is emailed.");
  const changed = Object.keys(next).filter((key) => JSON.stringify((current as Record<string, unknown>)[key] ?? null) !== JSON.stringify((next as Record<string, unknown>)[key] ?? null));
  if (changed.length === 0) return current;
  const technician = await tx.technician.update({ where: { id: technicianId }, data: next });
  await recordAuditEvent({ client: tx, action: "technician.updated", spaceId, actorId, targetType: "Technician", targetId: technicianId, metadata: { fields: changed.join(",") } });
  return technician;
}

/** Deactivated technicians keep their history and payouts but get no new requests. */
export async function setTechnicianActive(tx: Tx, spaceId: string, technicianId: string, active: boolean, actorId: string) {
  const updated = await tx.technician.updateMany({ where: { id: technicianId, spaceId }, data: { active } });
  if (updated.count !== 1) throw new DomainError("That technician wasn't found.", "not_found");
  await recordAuditEvent({ client: tx, action: active ? "technician.reactivated" : "technician.deactivated", spaceId, actorId, targetType: "Technician", targetId: technicianId });
}
