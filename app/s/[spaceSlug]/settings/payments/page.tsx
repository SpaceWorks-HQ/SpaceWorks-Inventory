import { PaymentSettingsForm } from "@/components/payments/PaymentSettingsForm";
import { PageHeader } from "@/components/ui/display";
import { getPaymentConfigView } from "@/lib/payments/config";
import { requireSpace } from "@/lib/permissions";

export default async function PaymentSettingsPage({ params }: PageProps<"/s/[spaceSlug]/settings/payments">) {
  const { spaceSlug } = await params;
  const { space } = await requireSpace(spaceSlug, "ADMIN");
  const config = await getPaymentConfigView(space.id);
  const slug = space.slug;
  const currency = space.currency;

  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      <PageHeader title="Payments" description="How members pay deposits, rental and fees. Keys are stored encrypted and never shown again after you save them." />
      <PaymentSettingsForm slug={slug} currency={currency} config={config} />
    </div>
  );
}
