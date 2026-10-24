import type { Metadata } from "next";
import { requireSpace } from "@/lib/permissions";
import { Callout, PageHeader } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { InventoryTelegramLink } from "@/components/agents/InventoryTelegramLink";
import { InventoryMentor } from "@/components/agents/InventoryMentor";

export const metadata: Metadata = { title: "Project mentor" };

export default async function MentorPage({ params }: PageProps<"/s/[spaceSlug]/mentor">) {
  const { spaceSlug } = await params;
  const { space } = await requireSpace(spaceSlug, "STAFF");
  const slug = space.slug;
  return <ListLayout header={<PageHeader title="Project mentor" description="Describe a project, compare real catalogue capabilities and available alternatives, then continue through the inventory desk." />}>
    <Callout title="Start here">
      <ol className="mt-2 list-decimal space-y-2 pl-5">
        <li><strong>Link Telegram privately.</strong> Create a private link code below, then send the /link command to the Inventory bot in a private chat. Keep the code private.</li>
        <li><strong>Describe your project.</strong> Tell the mentor what you want to make, the parts or tools you need, quantities and any requirements or constraints.</li>
        <li><strong>Review the options.</strong> Compare catalogue matches, availability and suggested alternatives before choosing what fits your project.</li>
        <li><strong>Continue at the inventory desk.</strong> Open the suggested item or lending page to request or arrange a loan. Mentor suggestions do not reserve or issue stock; the usual approval and handover steps still apply.</li>
      </ol>
    </Callout>
    <InventoryTelegramLink slug={slug} />
    <InventoryMentor slug={slug} />
  </ListLayout>;
}
