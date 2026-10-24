import { prisma } from "@/lib/db";
import { apiJson, withApi } from "@/lib/api/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/v1/space: the space this key belongs to (read:catalogue). */
export async function GET(request: Request) {
  return withApi(request, "read", "read:catalogue", async ({ spaceId }) => {
    const space = await prisma.space.findUniqueOrThrow({
      where: { id: spaceId },
      select: { id: true, slug: true, name: true, tagline: true, timezone: true, currency: true, tagPrefix: true, lendingEnabled: true, publicCatalogue: true, selfCheckoutEnabled: true, defaultLoanDays: true, maxLoanDays: true, acceptsTransfers: true },
    });
    const { lendingEnabled, publicCatalogue, selfCheckoutEnabled, defaultLoanDays, maxLoanDays, acceptsTransfers, ...rest } = space;
    return apiJson({ data: { ...rest, lending: { enabled: lendingEnabled, publicCatalogue, selfCheckout: selfCheckoutEnabled, defaultLoanDays, maxLoanDays }, acceptsTransfers } });
  });
}
