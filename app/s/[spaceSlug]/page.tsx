import { PageHeader } from "@/components/ui/display";
import { requireSpace } from "@/lib/permissions";

export default async function SpaceHomePage({ params }: PageProps<"/s/[spaceSlug]">) {
  const { spaceSlug } = await params;
  const { space } = await requireSpace(spaceSlug);
  return <PageHeader title={space.name} description={space.tagline ?? "Inventory, lending and transfers."} />;
}
