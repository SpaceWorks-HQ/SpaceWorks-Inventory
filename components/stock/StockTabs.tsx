import { NavTabs } from "@/components/ui/tabs";

/** Balances, the repair shelf and the ledger. */
export function StockTabs({ slug, active }: { slug: string; active: "balances" | "repair" | "ledger" }) {
  const base = `/s/${slug}/stock`;
  return (
    <NavTabs
      label="Stock views"
      items={[
        { href: base, label: "Balances", active: active === "balances" },
        { href: `${base}?view=repair`, label: "Repair shelf", active: active === "repair" },
        { href: `${base}/movements`, label: "Ledger", active: active === "ledger" },
      ]}
    />
  );
}
