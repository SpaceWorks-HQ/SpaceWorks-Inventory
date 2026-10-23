import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import type { AuditFilters } from "@/lib/reports/audit";

export const AUDIT_AREAS: readonly { value: string; label: string }[] = [
  { value: "settings.", label: "Settings" },
  { value: "member.", label: "Members" },
  { value: "invite.", label: "Invitations" },
  { value: "api_token.", label: "API keys" },
  { value: "webhook.", label: "Webhooks" },
  { value: "loan.", label: "Loans" },
  { value: "incident.", label: "Lost or damaged" },
  { value: "item.", label: "Items" },
  { value: "stock.", label: "Stock" },
  { value: "location.", label: "Locations" },
  { value: "count.", label: "Counts" },
  { value: "transfer.", label: "Transfers" },
  { value: "purchase.", label: "Purchases" },
  { value: "payment.", label: "Payments" },
  { value: "refund.", label: "Refunds" },
  { value: "import.", label: "Imports" },
];

export function AuditFilterBar({ basePath, filters, members, targetTypes, exportHref }: { basePath: string; filters: AuditFilters; members: { id: string; name: string }[]; targetTypes: string[]; exportHref: string }) {
  const filtered = Boolean(filters.action || filters.actorId || filters.targetType || filters.from || filters.to);
  return (
    <Card padding="sm">
      <form method="get" action={basePath} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <Field label="Area">
          <Dropdown name="action" defaultValue={filters.action ?? ""}>
            <option value="">Everything</option>
            {AUDIT_AREAS.map((area) => <option key={area.value} value={area.value}>{area.label}</option>)}
          </Dropdown>
        </Field>
        <Field label="By">
          <Dropdown name="actor" defaultValue={filters.actorId ?? ""}>
            <option value="">Anyone</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </Dropdown>
        </Field>
        <Field label="Target">
          <Dropdown name="target" defaultValue={filters.targetType ?? ""}>
            <option value="">Any target</option>
            {targetTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </Dropdown>
        </Field>
        <Field label="From">
          <Input type="date" name="from" defaultValue={filters.from ?? ""} />
        </Field>
        <Field label="To">
          <Input type="date" name="to" defaultValue={filters.to ?? ""} />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
          <Button type="submit" variant="secondary">Apply filters</Button>
          {filtered ? <Link href={basePath} className={buttonClasses({ variant: "quiet" })}>Clear filters</Link> : null}
          <a href={exportHref} className={buttonClasses({ variant: "ghost", className: "sm:ml-auto" })}>Export CSV</a>
        </div>
      </form>
    </Card>
  );
}
