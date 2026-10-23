import Link from "next/link";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { Card, CardHeader, Chip, PageHeader, SectionHeading } from "@/components/ui/display";
import { SettingsLayout } from "@/components/ui/layouts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireSpace } from "@/lib/permissions";
import { ROLE_MATRIX, roleDescription, roleLabel, SPACE_ROLES } from "@/lib/roles";

export const metadata = { title: "Roles" };

export default async function RolesPage({ params }: PageProps<"/s/[spaceSlug]/settings/roles">) {
  const { spaceSlug } = await params;
  const { space } = await requireSpace(spaceSlug, "ADMIN");
  const roles = [...SPACE_ROLES].reverse();
  const matrix = ROLE_MATRIX.map((row) => ({ capability: row.capability, allowed: roles.map((role) => row.check({ role })) }));
  const roleCards = SPACE_ROLES.map((role) => ({ role, label: roleLabel(role), description: roleDescription(role) }));
  const slug = space.slug;

  return (
    <SettingsLayout
      header={<PageHeader title="Space settings" description="How this makerspace lends, charges and works with other spaces. Every change is recorded in the audit log." />}
      tabs={<SettingsTabs slug={slug} />}
    >
      <div className="flex flex-col gap-6">
        <SectionHeading
          title="Roles"
          description="Each person has one role in this space. Higher roles can do everything the roles below them can. Borrowing standing is separate from the role."
        />
        <Card padding="lg">
          <CardHeader title="What each role is for" description={<>Change someone&apos;s role on the <Link href={`/s/${slug}/members`} className="font-semibold text-accent-text underline underline-offset-4">members page</Link>.</>} />
          <dl className="grid gap-4 sm:grid-cols-2">
            {roleCards.map((card) => (
              <div key={card.role} className="rounded-lg border border-line p-4">
                <dt className="text-title text-ink">{card.label}</dt>
                <dd className="mt-1 text-body-ui text-ink-secondary">{card.description}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Table label="What each role can do">
          <THead>
            <tr>
              <TH>Capability</TH>
              {roles.map((role) => <TH key={role} className="text-center">{roleLabel(role)}</TH>)}
            </tr>
          </THead>
          <TBody>
            {matrix.map((row) => (
              <TR key={row.capability}>
                <TD className="min-w-[220px] text-body-ui">{row.capability}</TD>
                {row.allowed.map((allowed, index) => (
                  <TD key={roles[index]} className="text-center">
                    <span className="sr-only">{`${roleLabel(roles[index]!)}: `}</span>
                    {allowed ? <Chip tone="success" size="sm">Yes</Chip> : <Chip tone="outline" size="sm">No</Chip>}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </SettingsLayout>
  );
}
