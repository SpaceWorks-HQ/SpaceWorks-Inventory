import { webhookResponse } from "@/lib/payments/webhookRoute";

export const dynamic = "force-dynamic";

/** Razorpay and Stripe webhooks: /api/payments/{razorpay|stripe}/{code}. Verified with the space's webhook secret. */
export async function POST(request: Request, ctx: RouteContext<"/api/payments/[provider]/[code]">) {
  const { provider, code } = await ctx.params;
  return webhookResponse(provider, code, request);
}
