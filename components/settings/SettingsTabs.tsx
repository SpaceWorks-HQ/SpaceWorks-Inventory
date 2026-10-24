"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { NavTabs } from "@/components/ui/tabs";

/**
 * Space-manager settings tabs. Section tabs live on /settings (`?tab=`);
 * payments, integrations and roles are their own routes.
 */
export const SPACE_SETTINGS_TABS: readonly { key: string; label: string; path?: string }[] = [
  { key: "general", label: "General" },
  { key: "lending", label: "Lending policy" },
  { key: "eligibility", label: "Member eligibility" },
  { key: "evidence", label: "Evidence rules" },
  { key: "fees", label: "Fees and deposits" },
  { key: "notifications", label: "Notifications" },
  { key: "network", label: "Transfers between spaces" },
  { key: "branding", label: "Branding" },
  { key: "payments", label: "Payments", path: "/payments" },
  { key: "integrations", label: "Integrations", path: "/integrations" },
  { key: "roles", label: "Roles", path: "/roles" },
  { key: "danger", label: "Danger zone" },
];

export function SettingsTabs({ slug }: { slug: string }) {
  return (
    <Suspense fallback={<Tabs slug={slug} tab={null} />}>
      <TabsFromUrl slug={slug} />
    </Suspense>
  );
}

function TabsFromUrl({ slug }: { slug: string }) {
  return <Tabs slug={slug} tab={useSearchParams()?.get("tab") ?? "general"} />;
}

function Tabs({ slug, tab }: { slug: string; tab: string | null }) {
  const pathname = usePathname() ?? "";
  const base = `/s/${slug}/settings`;
  return (
    <NavTabs
      label="Space settings"
      items={SPACE_SETTINGS_TABS.map((item) => {
        const href = item.path ? `${base}${item.path}` : item.key === "general" ? base : `${base}?tab=${item.key}`;
        const active = item.path ? pathname.startsWith(`${base}${item.path}`) : pathname === base && tab === item.key;
        return { href, label: item.label, active };
      })}
    />
  );
}
