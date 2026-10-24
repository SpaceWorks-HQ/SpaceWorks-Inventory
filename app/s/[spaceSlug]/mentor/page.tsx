import type { Metadata } from "next";
import { requireSpace } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { InventoryMentor } from "@/components/agents/InventoryMentor";

export const metadata: Metadata = { title: "Project mentor" };

export default async function MentorPage({ params }: PageProps<"/s/[spaceSlug]/mentor">) {
  const { spaceSlug } = await params;
  const { space } = await requireSpace(spaceSlug, "STAFF");
  const slug = space.slug;
  return <ListLayout header={<PageHeader title="Project mentor" description="Describe a project, compare real catalogue capabilities and available alternatives, then continue through the inventory desk." />}>
    <InventoryMentor slug={slug} />
  </ListLayout>;
}
