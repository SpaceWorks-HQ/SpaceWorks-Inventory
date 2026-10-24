"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { revalidatePath } from "@/lib/frontend/cache";
import { domainFailure, spaceAction } from "@/lib/actionContext";
import { validationError, type ActionResult } from "@/lib/actionResult";
import { addExternalTechnician, addStaffTechnician, saveChatSettings, setTechnicianActive, updateTechnician } from "@/lib/repairs";
import { telegramBotToken, telegramChatId, whatsappLanguage, whatsappNumber, whatsappPhoneNumberId, whatsappTemplate, whatsappToken } from "@/lib/repairs/channels";
import { canManageRepairs } from "@/lib/roles";
import { emailSchema, idSchema } from "@/lib/validation";

/** The technician directory and technician messaging (inventory managers). */

const blank = <T extends z.ZodTypeAny>(schema: T) => z.union([z.literal(""), z.null(), schema]).optional().transform((v) => (v ? (v as z.infer<T>) : null));

const contact = z.object({
  phone: blank(z.string().trim().max(40)),
  whatsapp: blank(whatsappNumber),
  telegramChatId: blank(telegramChatId),
  skills: z.array(z.string().trim().max(40)).max(12).default([]),
  preferredChannel: z.enum(["EMAIL", "WHATSAPP", "TELEGRAM"]).nullable().optional().transform((v) => v ?? null),
  notes: blank(z.string().trim().max(1000)),
});

const externalSchema = contact.extend({ name: z.string().trim().min(1, "Enter the technician's name.").max(120), email: emailSchema });

function done(slug: string) {
  revalidatePath(`/s/${slug}/repairs/technicians`);
  revalidatePath(`/s/${slug}/repairs`);
  return { ok: true as const, data: null };
}

export async function addExternalTechnicianAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canManageRepairs);
  if (denied) return denied;
  const parsed = externalSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await prisma.$transaction((tx) => addExternalTechnician(tx, ctx.space.id, parsed.data, ctx.user.id));
    return done(ctx.space.slug);
  } catch (error) {
    return domainFailure(error);
  }
}

export async function addStaffTechnicianAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canManageRepairs);
  if (denied) return denied;
  const parsed = contact.extend({ userId: idSchema }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await prisma.$transaction((tx) => addStaffTechnician(tx, ctx.space.id, parsed.data, ctx.user.id));
    return done(ctx.space.slug);
  } catch (error) {
    return domainFailure(error);
  }
}

export async function updateTechnicianAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canManageRepairs);
  if (denied) return denied;
  const parsed = contact.extend({ technicianId: idSchema, name: z.string().trim().min(1).max(120), email: blank(emailSchema) }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await prisma.$transaction((tx) => updateTechnician(tx, ctx.space.id, parsed.data.technicianId, parsed.data, ctx.user.id));
    return done(ctx.space.slug);
  } catch (error) {
    return domainFailure(error);
  }
}

export async function setTechnicianActiveAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canManageRepairs);
  if (denied) return denied;
  const parsed = z.object({ technicianId: idSchema, active: z.boolean() }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await prisma.$transaction((tx) => setTechnicianActive(tx, ctx.space.id, parsed.data.technicianId, parsed.data.active, ctx.user.id));
    return done(ctx.space.slug);
  } catch (error) {
    return domainFailure(error);
  }
}

const chatSchema = z.object({
  telegramBotToken: blank(telegramBotToken),
  clearTelegram: z.boolean().default(false),
  whatsappPhoneNumberId: blank(whatsappPhoneNumberId),
  whatsappToken: blank(whatsappToken),
  whatsappTemplate: whatsappTemplate.default("repair_request"),
  whatsappLanguage: whatsappLanguage.default("en"),
  clearWhatsapp: z.boolean().default(false),
});

/** Telegram bot and WhatsApp Cloud API credentials for messaging technicians. Secrets are write-only. */
export async function saveTechnicianMessagingAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canManageRepairs);
  if (denied) return denied;
  const parsed = chatSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await prisma.$transaction((tx) => saveChatSettings(tx, ctx.space.id, parsed.data, ctx.user.id));
    return done(ctx.space.slug);
  } catch (error) {
    return domainFailure(error);
  }
}
