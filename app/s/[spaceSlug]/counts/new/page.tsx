import { NewCountForm } from "@/components/counts/NewCountForm";
import { PageHeader } from "@/components/ui/display";
import { FormPageLayout } from "@/components/ui/layouts";
import { countFormOptions } from "@/lib/desk/counts";
import { requireSpace } from "@/lib/permissions";

export default async function NewCountPage({ params }: PageProps<"/s/[spaceSlug]/counts/new">) {
  const { spaceSlug } = await params;
  const { space } = await requireSpace(spaceSlug, "MANAGER");
  const options = await countFormOptions(space.id);
  const slug = space.slug;
  const locations = options.locations;
  const categories = options.categories;

  return (
    <FormPageLayout header={<PageHeader kicker="Cycle counts" title="New count" description="Takes a snapshot of what should be on the shelves now. Counters enter what they find." />}>
      <NewCountForm slug={slug} locations={locations} categories={categories} />
    </FormPageLayout>
  );
}
