// Generated from app/s/[spaceSlug]/setup/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import type { Space } from "@prisma/client";
import type { StoredValue } from "@/components/settings/settingsForm";
import { currencyMinorDigits } from "@/lib/format/money";
import { requireSpace } from "@/lib/permissions";
import { assignableRoles } from "@/lib/roles";
import { SETTINGS_SECTIONS, type SectionValues, type SettingsSection } from "@/lib/settings/sections";
import { setupProgress } from "@/lib/setup/onboarding";
import { setupStep } from "@/lib/setup/wizard";
function sectionValues(space: Space, section: SettingsSection): Record<string, StoredValue> {
  const record = space as unknown as Record<string, StoredValue>;
  return Object.fromEntries(Object.keys(SETTINGS_SECTIONS[section].schema.shape).map((key) => [key, record[key] ?? null]));
}
export async function loadSpaceSetupPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/setup">) {
const { spaceSlug } = await params;
const { step: rawStep } = await searchParams;
const { space, membership } = await requireSpace(spaceSlug, "MANAGER");
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
return viewDto({ space, step, progress, slug, minorDigits, general, lending, fees, roles, nextHref, completed } as const);
}
