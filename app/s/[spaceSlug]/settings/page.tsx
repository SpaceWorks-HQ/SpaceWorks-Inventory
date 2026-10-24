import Link from "next/link";
import type { Space } from "@prisma/client";
import { BrandingForm } from "@/components/settings/BrandingForm";
import { DeleteSpaceZone } from "@/components/settings/DeleteSpaceZone";
import { SectionForm } from "@/components/settings/SectionForm";
import { SECTION_DESCRIPTIONS } from "@/components/settings/settingsFields";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import type { StoredValue } from "@/components/settings/settingsForm";
import { PageHeader, SectionHeading } from "@/components/ui/display";
import { SettingsLayout } from "@/components/ui/layouts";
import { currencyMinorDigits } from "@/lib/format/money";
import { requireSpace } from "@/lib/permissions";
import { canDeleteSpace } from "@/lib/roles";
import { SETTINGS_SECTIONS, type SettingsSection } from "@/lib/settings/sections";

export const metadata = { title: "Space settings" };

const PAGE_SECTIONS: readonly SettingsSection[] = ["general", "lending", "eligibility", "evidence", "fees", "notifications", "network"];
const EXTRA_TABS = ["branding", "danger"] as const;

function pickTab(raw: string | string[] | undefined): SettingsSection | (typeof EXTRA_TABS)[number] {
  const tab = typeof raw === "string" ? raw : "general";
  if ((PAGE_SECTIONS as readonly string[]).includes(tab)) return tab as SettingsSection;
  if ((EXTRA_TABS as readonly string[]).includes(tab)) return tab as (typeof EXTRA_TABS)[number];
  return "general";
}

/** Only the fields of one section, as plain values for the client form. */
function sectionValues(space: Space, section: SettingsSection): Record<string, StoredValue> {
  const keys = Object.keys(SETTINGS_SECTIONS[section].schema.shape);
  const record = space as unknown as Record<string, StoredValue>;
  return Object.fromEntries(keys.map((key) => [key, record[key] ?? null]));
}

export default async function SpaceSettingsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/settings">) {
  const { spaceSlug } = await params;
  const { tab: rawTab } = await searchParams;
  const { space, membership } = await requireSpace(spaceSlug, "MANAGER");
  const tab = pickTab(rawTab);
  const section = (PAGE_SECTIONS as readonly string[]).includes(tab) ? (tab as SettingsSection) : null;
  const values = section ? sectionValues(space, section) : null;
  const minorDigits = currencyMinorDigits(space.currency);
  const logoUrl = space.logoKey ? `/api/s/${space.slug}/logo?v=${space.updatedAt.getTime()}` : null;
  const slug = space.slug;

  return (
    <SettingsLayout
      header={<PageHeader title="Space settings" description="How this makerspace lends, charges and works with other spaces. Every change is recorded in the audit log." />}
      tabs={<SettingsTabs slug={slug} />}
    >
      {section && values ? (
        <div className="flex flex-col gap-4">
          <SectionHeading title={SETTINGS_SECTIONS[section].title} description={SECTION_DESCRIPTIONS[section]} />
          {section === "fees" ? (
            <p className="text-body-ui text-ink-secondary">
              Members pay through the providers set up under{" "}
              <Link href={`/s/${slug}/settings/payments`} className="font-semibold text-accent-text underline underline-offset-4">Payments</Link>.
            </p>
          ) : null}
          <SectionForm key={section} slug={slug} section={section} values={values} currency={space.currency} minorDigits={minorDigits} />
        </div>
      ) : tab === "branding" ? (
        <div className="flex flex-col gap-4">
          <SectionHeading title="Branding" description="How this space looks to members and visitors." />
          <BrandingForm slug={slug} spaceName={space.name} logoUrl={logoUrl} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <SectionHeading title="Danger zone" description="Steps that can't be undone." />
          <DeleteSpaceZone slug={slug} spaceName={space.name} canDelete={canDeleteSpace(membership)} />
        </div>
      )}
    </SettingsLayout>
  );
}
