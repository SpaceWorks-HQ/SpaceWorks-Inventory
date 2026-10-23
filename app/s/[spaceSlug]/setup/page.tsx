import type { Space } from "@prisma/client";
import { SectionForm } from "@/components/settings/SectionForm";
import type { StoredValue } from "@/components/settings/settingsForm";
import { CategoriesStep } from "@/components/setup/CategoriesStep";
import { DataStep } from "@/components/setup/DataStep";
import { LendingStep } from "@/components/setup/LendingStep";
import { LocationsStep } from "@/components/setup/LocationsStep";
import { RoleMatrix } from "@/components/setup/RoleMatrix";
import { SetupProgress, StepFooter } from "@/components/setup/SetupProgress";
import { TeamStep } from "@/components/setup/TeamStep";
import { Callout, PageHeader } from "@/components/ui/display";
import { FormPageLayout } from "@/components/ui/layouts";
import { currencyMinorDigits } from "@/lib/format/money";
import { requireSpace } from "@/lib/permissions";
import { assignableRoles } from "@/lib/roles";
import { SETTINGS_SECTIONS, type SectionValues, type SettingsSection } from "@/lib/settings/sections";
import { SUGGESTED_CATEGORIES } from "@/lib/spaces";
import { setupProgress } from "@/lib/setup/onboarding";
import { setupStep } from "@/lib/setup/wizard";

export const metadata = { title: "Set up your space" };

/** Only the fields of one settings section, as plain values for the client forms. */
function sectionValues(space: Space, section: SettingsSection): Record<string, StoredValue> {
  const record = space as unknown as Record<string, StoredValue>;
  return Object.fromEntries(Object.keys(SETTINGS_SECTIONS[section].schema.shape).map((key) => [key, record[key] ?? null]));
}

export default async function SpaceSetupPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/setup">) {
  const { spaceSlug } = await params;
  const { step: rawStep } = await searchParams;
  const { space, membership } = await requireSpace(spaceSlug, "ADMIN");
  const step = setupStep(rawStep);
  const progress = await setupProgress(space.id);
  const slug = space.slug;
  const minorDigits = currencyMinorDigits(space.currency);
  const general = sectionValues(space, "general");
  const lending = sectionValues(space, "lending") as unknown as SectionValues<"lending">;
  const fees = sectionValues(space, "fees") as unknown as SectionValues<"fees">;
  const roles = assignableRoles(membership);
  const nextHref = `/s/${slug}/setup?step=${step + 1}`;
  const completed = space.setupCompletedAt !== null;

  return (
    <FormPageLayout
      header={
        <div className="space-y-5">
          <PageHeader kicker={space.name} title="Set up your space" description="Six short steps. Skip anything you don't need yet; every step can be changed later." />
          {completed && step === 1 ? <Callout tone="success" title="Setup is already done.">You can still revisit any step.</Callout> : null}
          <SetupProgress slug={slug} step={step} />
        </div>
      }
    >
      <div className="space-y-6">
        {step === 1 ? <SectionForm slug={slug} section="general" values={general} currency={space.currency} minorDigits={minorDigits} /> : null}
        {step === 2 ? <LocationsStep slug={slug} existing={progress.locations} nextHref={nextHref} /> : null}
        {step === 3 ? <CategoriesStep slug={slug} suggestions={[...SUGGESTED_CATEGORIES]} categories={progress.categories.map((c) => c.name)} units={progress.units.map((u) => ({ name: u.name, symbol: u.symbol }))} /> : null}
        {step === 4 ? (
          <>
            <TeamStep slug={slug} roles={roles} members={progress.members} pendingInvitations={progress.invitations} />
            <RoleMatrix />
          </>
        ) : null}
        {step === 5 ? <LendingStep slug={slug} lending={lending} fees={fees} currency={space.currency} minorDigits={minorDigits} nextHref={nextHref} /> : null}
        {step === 6 ? <DataStep slug={slug} items={progress.items} completed={completed} /> : null}
        <StepFooter slug={slug} step={step} nextLabel={step === 1 || step === 3 || step === 4 ? "Next step" : "Skip this step"} />
      </div>
    </FormPageLayout>
  );
}
