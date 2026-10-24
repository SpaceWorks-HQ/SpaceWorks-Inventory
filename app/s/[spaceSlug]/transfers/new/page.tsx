import { NewTransferForm } from "@/components/transfers/NewTransferForm";
import { PageHeader } from "@/components/ui/display";
import { FormPageLayout } from "@/components/ui/layouts";
import { localStock, otherSpaces, sharedStock } from "@/lib/desk/transferOptions";
import { requireSpace } from "@/lib/permissions";

const MODES = ["internal", "push", "pull"] as const;

export default async function NewTransferPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/transfers/new">) {
  const { spaceSlug } = await params;
  const { space } = await requireSpace(spaceSlug, "STAFF");
  const query = await searchParams;
  const initialMode = MODES.find((value) => value === query.mode) ?? "internal";
  const from = typeof query.from === "string" ? query.from.slice(0, 64) : null;
  const stock = await localStock(space.id);
  const spaces = await otherSpaces(space.id);
  const shared = initialMode === "pull" && from ? await sharedStock(from, space.id) : null;
  const slug = space.slug;
  const locations = stock.locations;
  const localItems = stock.items.map((item) => ({ id: item.id, name: item.name, sku: item.sku, available: item.available }));
  const pushTargets = spaces.pushTargets;
  const pullSources = spaces.pullSources;

  return (
    <FormPageLayout header={<PageHeader kicker="Transfers" title="New transfer" description="Moves inside this space may need a manager's approval; the sending space approves transfers between spaces." />}>
      <NewTransferForm key={`${initialMode}:${shared?.slug ?? ""}`} slug={slug} initialMode={initialMode} locations={locations} localItems={localItems} pushTargets={pushTargets} pullSources={pullSources} shared={shared} />
    </FormPageLayout>
  );
}
