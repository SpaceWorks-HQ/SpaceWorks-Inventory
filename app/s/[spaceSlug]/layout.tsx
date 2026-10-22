import type { Metadata } from "next";
import { AppShell } from "@/components/chrome/AppShell";
import { getShellData } from "@/lib/appShell";
import { requireSpace } from "@/lib/permissions";

export async function generateMetadata({ params }: LayoutProps<"/s/[spaceSlug]">): Promise<Metadata> {
  const { spaceSlug } = await params;
  const { space } = await requireSpace(spaceSlug);
  return { title: { default: space.name, template: `%s · ${space.name}` } };
}

/**
 * Space shell. Membership is checked here for the chrome, and again by
 * every page (layouts do not re-run on client navigation).
 */
export default async function SpaceLayout({ children, params }: LayoutProps<"/s/[spaceSlug]">) {
  const { spaceSlug } = await params;
  const { user, space, membership } = await requireSpace(spaceSlug);
  const data = await getShellData(user, space, membership);
  return <AppShell data={data}>{children}</AppShell>;
}
