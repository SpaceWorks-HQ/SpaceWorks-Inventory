import "server-only";

import type { SpacePaymentConfig } from "@prisma/client";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit";
import { decryptSecret, encryptSecret, randomToken } from "@/lib/crypto";
import { prisma, type DbClient } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import type { GatewayCredentials, PaymentGateway } from "./gateway";
import { razorpay } from "./razorpay";
import { stripe } from "./stripe";

export type GatewayProvider = "RAZORPAY" | "STRIPE";

export const GATEWAYS: Record<GatewayProvider, PaymentGateway> = { RAZORPAY: razorpay, STRIPE: stripe };

/** Currencies Razorpay takes (international ones depend on the account); Stripe takes all of ours. */
const RAZORPAY_CURRENCIES = new Set(["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "NZD", "LKR", "BDT", "NPR", "QAR", "SAR", "OMR", "KWD", "BHD", "MYR", "ZAR", "JPY"]);

export function gatewayTakes(provider: GatewayProvider, currency: string) {
  return provider === "STRIPE" || RAZORPAY_CURRENCIES.has(currency);
}

/** A new opaque code for this space's webhook URLs (never the space id or slug). */
export function newWebhookCode() {
  return randomToken(24);
}

export function isWebhookCode(code: string) {
  return /^[A-Za-z0-9_-]{16,64}$/.test(code);
}

/** Webhook URLs for a saved config; null until the space saves its payment settings. */
export function webhookUrls(code: string | null) {
  if (!code) return null;
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  return { razorpay: `${base}/api/payments/razorpay/${code}`, stripe: `${base}/api/payments/stripe/${code}` };
}

/** Config for the webhook code, or null. */
export function findConfigByWebhookCode(code: string) {
  if (!isWebhookCode(code)) return Promise.resolve(null);
  return prisma.spacePaymentConfig.findUnique({ where: { webhookPublicCode: code } });
}

const open = (value: string | null) => (value ? decryptSecret("payment-secrets", value) : null);

/** Decrypted credentials for one provider, or null when it is off or missing its secret. */
export function credentialsFor(config: SpacePaymentConfig, provider: GatewayProvider): GatewayCredentials | null {
  if (provider === "RAZORPAY") {
    if (!config.razorpayEnabled || !config.razorpayKeyId || !config.razorpaySecretEnc) return null;
    return { keyId: config.razorpayKeyId, secret: open(config.razorpaySecretEnc)!, webhookSecret: open(config.razorpayWebhookEnc), testMode: config.testMode };
  }
  if (!config.stripeEnabled || !config.stripeSecretEnc) return null;
  return { keyId: null, secret: open(config.stripeSecretEnc)!, webhookSecret: open(config.stripeWebhookEnc), testMode: config.testMode };
}

/** Providers a borrower can pay through right now, Razorpay first. */
export function enabledProviders(config: SpacePaymentConfig | null): GatewayProvider[] {
  if (!config) return [];
  const out: GatewayProvider[] = [];
  if (config.razorpayEnabled && config.razorpayKeyId && config.razorpaySecretEnc) out.push("RAZORPAY");
  if (config.stripeEnabled && config.stripeSecretEnc) out.push("STRIPE");
  return out;
}

export async function loadGateway(spaceId: string, provider: GatewayProvider, client: DbClient = prisma) {
  const config = await client.spacePaymentConfig.findUnique({ where: { spaceId } });
  const credentials = config ? credentialsFor(config, provider) : null;
  if (!config || !credentials) return null;
  return { provider, gateway: GATEWAYS[provider], credentials, config };
}

/** What the settings page shows: never a secret, only whether one is saved. */
export type PaymentConfigView = {
  razorpayEnabled: boolean;
  razorpayKeyId: string;
  razorpaySecretSet: boolean;
  razorpayWebhookSecretSet: boolean;
  stripeEnabled: boolean;
  stripeSecretSet: boolean;
  stripeWebhookSecretSet: boolean;
  testMode: boolean;
  offlineEnabled: boolean;
  offlineInstructions: string;
  /** Null until the payment settings are saved once. */
  webhookUrls: { razorpay: string; stripe: string } | null;
};

export async function getPaymentConfigView(spaceId: string): Promise<PaymentConfigView> {
  const config = await prisma.spacePaymentConfig.findUnique({ where: { spaceId } });
  return {
    razorpayEnabled: config?.razorpayEnabled ?? false,
    razorpayKeyId: config?.razorpayKeyId ?? "",
    razorpaySecretSet: Boolean(config?.razorpaySecretEnc),
    razorpayWebhookSecretSet: Boolean(config?.razorpayWebhookEnc),
    stripeEnabled: config?.stripeEnabled ?? false,
    stripeSecretSet: Boolean(config?.stripeSecretEnc),
    stripeWebhookSecretSet: Boolean(config?.stripeWebhookEnc),
    testMode: config?.testMode ?? true,
    offlineEnabled: config?.offlineEnabled ?? true,
    offlineInstructions: config?.offlineInstructions ?? "",
    webhookUrls: webhookUrls(config?.webhookPublicCode ?? null),
  };
}

const secret = z.string().trim().max(500).optional().default("");

export const paymentConfigSchema = z.object({
  razorpayEnabled: z.boolean(),
  razorpayKeyId: z.string().trim().max(100).regex(/^(rzp_(test|live)_[A-Za-z0-9]+)?$/, "Razorpay key ids start with rzp_test_ or rzp_live_.").optional().default(""),
  razorpaySecret: secret,
  razorpayWebhookSecret: secret,
  stripeEnabled: z.boolean(),
  stripeSecret: secret.refine((value) => !value || /^(sk|rk)_(test|live)_/.test(value), "Stripe secret keys start with sk_test_, sk_live_, rk_test_ or rk_live_."),
  stripeWebhookSecret: secret.refine((value) => !value || value.startsWith("whsec_"), "Stripe webhook secrets start with whsec_."),
  testMode: z.boolean(),
  offlineEnabled: z.boolean(),
  offlineInstructions: z.string().trim().max(1000).optional().default(""),
});

export type PaymentConfigInput = z.infer<typeof paymentConfigSchema>;

/**
 * Save the space's providers. Secrets are write-only: a blank field keeps
 * the saved value. Turning a provider on needs its keys. Audited with the
 * names of the fields that changed, never their values.
 */
export async function savePaymentConfig(spaceId: string, input: PaymentConfigInput, actor: { userId: string }) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.spacePaymentConfig.findUnique({ where: { spaceId } });
    const seal = (value: string, previous: string | null | undefined) => (value ? encryptSecret("payment-secrets", value) : (previous ?? null));
    const data = {
      razorpayEnabled: input.razorpayEnabled,
      razorpayKeyId: input.razorpayKeyId || current?.razorpayKeyId || null,
      razorpaySecretEnc: seal(input.razorpaySecret, current?.razorpaySecretEnc),
      razorpayWebhookEnc: seal(input.razorpayWebhookSecret, current?.razorpayWebhookEnc),
      stripeEnabled: input.stripeEnabled,
      stripeSecretEnc: seal(input.stripeSecret, current?.stripeSecretEnc),
      stripeWebhookEnc: seal(input.stripeWebhookSecret, current?.stripeWebhookEnc),
      testMode: input.testMode,
      offlineEnabled: input.offlineEnabled,
      offlineInstructions: input.offlineInstructions || null,
    };
    if (data.razorpayEnabled && (!data.razorpayKeyId || !data.razorpaySecretEnc || !data.razorpayWebhookEnc)) {
      throw new DomainError("Add the Razorpay key id, key secret and webhook secret before turning Razorpay on.");
    }
    if (data.stripeEnabled && (!data.stripeSecretEnc || !data.stripeWebhookEnc)) {
      throw new DomainError("Add the Stripe secret key and webhook secret before turning Stripe on.");
    }
    const changed = Object.keys(data).filter((key) => {
      if (key.endsWith("Enc")) return (input as Record<string, unknown>)[secretInputFor[key]!] !== "";
      return (current as Record<string, unknown> | null)?.[key] !== (data as Record<string, unknown>)[key];
    });
    await tx.spacePaymentConfig.upsert({ where: { spaceId }, create: { spaceId, webhookPublicCode: newWebhookCode(), ...data }, update: data });
    if (changed.length > 0) {
      await recordAuditEvent({ client: tx, action: "payments.settings_updated", spaceId, actorId: actor.userId, targetType: "SpacePaymentConfig", targetId: spaceId, metadata: { fields: changed.join(",") } });
    }
    return { changed };
  });
}

const secretInputFor: Record<string, string> = {
  razorpaySecretEnc: "razorpaySecret",
  razorpayWebhookEnc: "razorpayWebhookSecret",
  stripeSecretEnc: "stripeSecret",
  stripeWebhookEnc: "stripeWebhookSecret",
};

/** Ask the provider whether the saved keys work. The answer is a UI-safe sentence. */
export async function testConnection(spaceId: string, provider: GatewayProvider): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = await prisma.spacePaymentConfig.findUnique({ where: { spaceId } });
  const name = provider === "RAZORPAY" ? "Razorpay" : "Stripe";
  if (!config) return { ok: false, error: `Save the ${name} keys first.` };
  const forced = { ...config, razorpayEnabled: true, stripeEnabled: true };
  const credentials = credentialsFor(forced, provider);
  if (!credentials) return { ok: false, error: `Save the ${name} keys first.` };
  const result = await GATEWAYS[provider].testConnection(credentials);
  return result.ok ? result : { ok: false, error: `${name} didn't accept the keys. Check them and try again.` };
}
