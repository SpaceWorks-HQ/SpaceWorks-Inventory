import { Chip } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ROLE_MATRIX, roleDescription, roleLabel, SPACE_ROLES } from "@/lib/roles";

/** Who can do what, in words: role descriptions, then capabilities × roles with Yes/No. */
export function RoleMatrix() {
  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2">
        {SPACE_ROLES.map((role) => (
          <div key={role} className="rounded-lg border border-line bg-surface p-4">
            <dt className="text-label text-ink">{roleLabel(role)}</dt>
            <dd className="mt-1 text-caption text-ink-muted">{roleDescription(role)}</dd>
          </div>
        ))}
      </dl>
      <Table label="What each role can do">
        <THead>
          <tr>
            <TH>Capability</TH>
            {[...SPACE_ROLES].reverse().map((role) => <TH key={role}>{roleLabel(role)}</TH>)}
          </tr>
        </THead>
        <TBody>
          {ROLE_MATRIX.map((row) => (
            <TR key={row.capability}>
              <TD className="min-w-[220px]">{row.capability}</TD>
              {[...SPACE_ROLES].reverse().map((role) => (
                <TD key={role}>{row.check({ role }) ? <Chip tone="success" size="sm">Yes</Chip> : <Chip tone="outline" size="sm">No</Chip>}</TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
