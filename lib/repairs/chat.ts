import "server-only";

import type { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { prisma, type Tx } from "@/lib/db";
import { describeOperationalError } from "@/lib/redactSensitiveText";
import { whatsappParameter } from "./channels";

/**
 * Direct messages to technicians on Telegram (the space's bot) and WhatsApp
 * (Cloud API template). Credentials are encrypted ("chat-secrets") and
 * write-only. Messages go through the outbox ("repair-chat" jobs) after the
 * request commits; a space without a provider simply skips that channel.
 */

export const REPAIR_CHAT_KIND = "repair-chat";

export type ChatSettingsView = { telegram: boolean; whatsapp: boolean; whatsappPhoneNumberId: string | null; whatsappTemplate: string; whatsappLanguage: string };

export async function chatSettingsView(spaceId: string): Promise<ChatSettingsView> {
  const row = await prisma.spaceChatConfig.findUnique({ where: { spaceId } });
  return {
    telegram: Boolean(row?.telegramBotTokenEnc),
    whatsapp: Boolean(row?.whatsappTokenEnc && row.whatsappPhoneNumberId),
    whatsappPhoneNumberId: row?.whatsappPhoneNumberId ?? null,
    whatsappTemplate: row?.whatsappTemplate ?? "repair_request",
    whatsappLanguage: row?.whatsappLanguage ?? "en",
  };
}

export type ChatSettingsInput = {
  /** A new token, or null to keep the saved one. */
  telegramBotToken: string | null;
  clearTelegram: boolean;
  whatsappPhoneNumberId: string | null;
  whatsappToken: string | null;
  whatsappTemplate: string;
  whatsappLanguage: string;
  clearWhatsapp: boolean;
};

export async function saveChatSettings(tx: Tx, spaceId: string, input: ChatSettingsInput, actorId: string) {
  const current = await tx.spaceChatConfig.findUnique({ where: { spaceId } });
  const data: Prisma.SpaceChatConfigUncheckedCreateInput = {
    spaceId,
    telegramBotTokenEnc: input.clearTelegram ? null : input.telegramBotToken ? encryptSecret("chat-secrets", input.telegramBotToken) : current?.telegramBotTokenEnc ?? null,
    whatsappPhoneNumberId: input.clearWhatsapp ? null : input.whatsappPhoneNumberId ?? current?.whatsappPhoneNumberId ?? null,
    whatsappTokenEnc: input.clearWhatsapp ? null : input.whatsappToken ? encryptSecret("chat-secrets", input.whatsappToken) : current?.whatsappTokenEnc ?? null,
    whatsappTemplate: input.whatsappTemplate,
    whatsappLanguage: input.whatsappLanguage,
  };
  await tx.spaceChatConfig.upsert({ where: { spaceId }, create: data, update: data });
  await recordAuditEvent({ client: tx, action: "chat.settings_updated", spaceId, actorId, targetType: "Space", targetId: spaceId, metadata: { telegram: Boolean(data.telegramBotTokenEnc), whatsapp: Boolean(data.whatsappTokenEnc && data.whatsappPhoneNumberId) } });
}

/** Which direct-message channels this space can use right now. */
export async function chatChannels(tx: Tx, spaceId: string) {
  const row = await tx.spaceChatConfig.findUnique({ where: { spaceId }, select: { telegramBotTokenEnc: true, whatsappTokenEnc: true, whatsappPhoneNumberId: true } });
  return { telegram: Boolean(row?.telegramBotTokenEnc), whatsapp: Boolean(row?.whatsappTokenEnc && row.whatsappPhoneNumberId) };
}

class ChatSendError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  let response: Response;
  try {
    // Never follow redirects: the provider must not bounce us somewhere else.
    response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch {
    throw new ChatSendError("The chat service could not be reached.", true);
  }
  if (response.ok) return;
  throw new ChatSendError(`The chat service answered ${response.status}.`, response.status === 429 || response.status >= 500);
}

type JobPayload = { spaceId: string; channel: "TELEGRAM" | "WHATSAPP"; to: string; text: string; expiresAt: string };

function readPayload(raw: Prisma.JsonValue): JobPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.spaceId !== "string" || (p.channel !== "TELEGRAM" && p.channel !== "WHATSAPP") || typeof p.to !== "string" || typeof p.text !== "string" || typeof p.expiresAt !== "string") return null;
  return { spaceId: p.spaceId, channel: p.channel, to: p.to.slice(0, 64), text: p.text.slice(0, 4000), expiresAt: p.expiresAt };
}

/** Send one queued direct message. Never throws: failures become a retry or a terminal failure. */
export async function runRepairChatJob(raw: Prisma.JsonValue): Promise<{ status: "done" } | { status: "retry"; delayMs: number; error: string } | { status: "failed"; error: string }> {
  const payload = readPayload(raw);
  if (!payload) return { status: "failed", error: "Malformed chat job." };
  if (new Date(payload.expiresAt) <= new Date()) return { status: "done" };
  try {
    const config = await prisma.spaceChatConfig.findUnique({ where: { spaceId: payload.spaceId } });
    if (payload.channel === "TELEGRAM") {
      if (!config?.telegramBotTokenEnc) return { status: "done" };
      const token = decryptSecret("chat-secrets", config.telegramBotTokenEnc);
      await post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: payload.to, text: payload.text.slice(0, 4096), disable_web_page_preview: true });
    } else {
      if (!config?.whatsappTokenEnc || !config.whatsappPhoneNumberId) return { status: "done" };
      const token = decryptSecret("chat-secrets", config.whatsappTokenEnc);
      await post(`https://graph.facebook.com/v21.0/${config.whatsappPhoneNumberId}/messages`, {
        messaging_product: "whatsapp",
        to: payload.to.replace(/^\+/, ""),
        type: "template",
        template: { name: config.whatsappTemplate, language: { code: config.whatsappLanguage }, components: [{ type: "body", parameters: [{ type: "text", text: whatsappParameter(payload.text) }] }] },
      }, { authorization: `Bearer ${token}` });
    }
    return { status: "done" };
  } catch (error) {
    if (error instanceof ChatSendError && error.retryable) return { status: "retry", delayMs: 5 * 60_000, error: error.message };
    return { status: "failed", error: error instanceof ChatSendError ? error.message : describeOperationalError(error) };
  }
}
