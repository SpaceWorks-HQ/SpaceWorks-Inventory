import { ScanLookup } from "@/components/desk/ScanLookup";
import { PageHeader } from "@/components/ui/display";
import { requireSpace } from "@/lib/permissions";

export default async function ScanPage({ params }: PageProps<"/s/[spaceSlug]/scan">) {
  const { spaceSlug } = await params;
  const { space } = await requireSpace(spaceSlug, "STAFF");
  const slug = space.slug;

  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl space-y-6 [overflow-wrap:anywhere]">
      <PageHeader title="Scan" description="Scan any label in this space: an item, a tool's asset tag, a shelf, a kit or a container. It opens the right page and shows the loan or transfer holding it." />
      <ScanLookup slug={slug} />
    </div>
  );
}
