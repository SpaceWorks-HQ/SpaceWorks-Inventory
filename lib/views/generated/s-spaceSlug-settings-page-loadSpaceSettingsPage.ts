// Generated from app/s/[spaceSlug]/settings/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import type { Space } from "@prisma/client";
import type { StoredValue } from "@/components/settings/settingsForm";
import { currencyMinorDigits } from "@/lib/format/money";
import { requireSpace } from "@/lib/permissions";
import { SETTINGS_SECTIONS, type SettingsSection } from "@/lib/settings/sections";
const PAGE_SECTIONS: readonly SettingsSection[] = ["general", "lending", "eligibility", "evidence", "fees", "notifications", "network"];
const EXTRA_TABS = ["branding", "danger"] as const;
function pickTab(raw: string | string[] | undefined): SettingsSection | (typeof EXTRA_TABS)[number] {
  const tab = typeof raw === "string" ? raw : "general";
  if ((PAGE_SECTIONS as readonly string[]).includes(tab)) return tab as SettingsSection;
  if ((EXTRA_TABS as readonly string[]).includes(tab)) return tab as (typeof EXTRA_TABS)[number];
  return "general";
}
function sectionValues(space: Space, section: SettingsSection): Record<string, StoredValue> {
  const keys = Object.keys(SETTINGS_SECTIONS[section].schema.shape);
  const record = space as unknown as Record<string, StoredValue>;
  return Object.fromEntries(keys.map((key) => [key, record[key] ?? null]));
}
export async function loadSpaceSettingsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/settings">) {
const { spaceSlug } = await params;
const { tab: rawTab } = await searchParams;
const { space, membership } = await requireSpace(spaceSlug, "ADMIN");
const tab = pickTab(rawTab);
const section = (PAGE_SECTIONS as readonly string[]).includes(tab) ? (tab as SettingsSection) : null;
const values = section ? sectionValues(space, section) : null;
const minorDigits = currencyMinorDigits(space.currency);
const logoUrl = space.logoKey ? `/api/s/${space.slug}/logo?v=${space.updatedAt.getTime()}` : null;
const isOwner = membership.role === "OWNER";
const slug = space.slug;
return viewDto({ space, tab, section, values, minorDigits, logoUrl, isOwner, slug } as const);
}
