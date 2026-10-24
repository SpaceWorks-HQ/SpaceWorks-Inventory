import { z } from "zod";

/** Contact and chat-credential formats (pure and client-safe, shared by forms and the server). */
export const whatsappNumber = z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, "Use the full number with the country code, for example +919876543210.");
export const telegramChatId = z.string().trim().regex(/^(-?\d{3,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/, "Use the numeric chat ID (the technician gets it by messaging your bot) or @username.");
export const telegramBotToken = z.string().trim().regex(/^\d{5,15}:[A-Za-z0-9_-]{30,64}$/, "Paste the bot token from @BotFather.");
export const whatsappPhoneNumberId = z.string().trim().regex(/^\d{5,20}$/, "Use the phone number ID from WhatsApp Manager.");
export const whatsappToken = z.string().trim().min(20, "Paste a permanent access token.").max(1000);
export const whatsappTemplate = z.string().trim().regex(/^[a-z0-9_]{1,100}$/, "Use the template's name: lower-case letters, digits and underscores.");
export const whatsappLanguage = z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, "Use a language code such as en or en_US.");

export const CHANNEL_LABEL = { EMAIL: "Email", WHATSAPP: "WhatsApp", TELEGRAM: "Telegram", INBOX: "Inbox" } as const;

/** WhatsApp template parameters may not contain line breaks, tabs or runs of spaces. */
export function whatsappParameter(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 1000);
}
