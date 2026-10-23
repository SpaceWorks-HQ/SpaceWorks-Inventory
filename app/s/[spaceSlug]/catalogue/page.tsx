import Link from "next/link";
import { CatalogueBrowser } from "@/components/borrow/CatalogueBrowser";
import { buttonClasses } from "@/components/ui/button";
import { Callout, EmptyState, PageHeader } from "@/components/ui/display";
import { prisma } from "@/lib/db";
import { borrowCatalogue } from "@/lib/desk/catalogue";
import { dateInputValue } from "@/lib/desk/dates";
import { checkBorrowingEligibility } from "@/lib/lending/access";
import { requireSpace } from "@/lib/permissions";

export default async function CataloguePage({ params }: PageProps<"/s/[spaceSlug]/catalogue">) {
  const { spaceSlug } = await params;
  const { space, user } = await requireSpace(spaceSlug, "MEMBER");
  const catalogue = await borrowCatalogue(space);
  const eligibility = await checkBorrowingEligibility(prisma, { spaceId: space.id, userId: user.id, incomingUnits: 0 });
  const blocked = eligibility.ok ? null : eligibility.error;
  const slug = space.slug;
  const items = catalogue.items;
  const kits = catalogue.kits;
  const categories = catalogue.categories;
  const minDate = dateInputValue(new Date(), space.timezone);
  const selfCheckout = space.lendingEnabled && space.selfCheckoutEnabled;
  const lendingOff = !space.lendingEnabled;

  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      <PageHeader
        title="Borrow"
        description="Find a tool or part, add it to your request and collect it from the desk once it's approved."
        actions={selfCheckout ? <Link href={`/s/${slug}/catalogue/self-checkout`} className={buttonClasses({ variant: "secondary" })}>Self-checkout</Link> : undefined}
      />
      {lendingOff ? (
        <EmptyState patch title="Lending is switched off.">Ask the space team when borrowing opens again.</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState patch title="Nothing to borrow yet.">Staff mark tools as lendable; they&apos;ll show up here.</EmptyState>
      ) : (
        <>
          {blocked ? <Callout tone="warning" title="You can't borrow right now">{blocked}</Callout> : null}
          <CatalogueBrowser slug={slug} items={items} kits={kits} categories={categories} blocked={blocked} minDate={minDate} />
        </>
      )}
    </div>
  );
}
