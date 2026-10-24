import Link from "next/link";
import { MOVEMENT_LABEL, REASON_LABEL, signed } from "@/components/catalogue/words";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export type MovementView = {
  id: string; when: string; type: string; quantity: number; reservedDelta: number; quarantinedDelta: number; balanceAfter: number;
  reason: string | null; note: string | null; item: { id: string; name: string; sku: string }; asset: { id: string; assetTag: string } | null;
  location: string | null; actor: string; ref: { label: string; href: string | null } | null;
};

/** What changed besides on-hand: holds and the repair shelf, in words. */
function sideEffects(row: MovementView) {
  const parts: string[] = [];
  if (row.quarantinedDelta) parts.push(`${signed(row.quarantinedDelta)} under repair`);
  if (row.reservedDelta) parts.push(`${signed(row.reservedDelta)} held`);
  return parts.join(", ");
}

/** The append-only stock ledger: newest first, signed changes, who and why. */
export function MovementsTable({ slug, rows, showItem = true }: { slug: string; rows: MovementView[]; showItem?: boolean }) {
  return (
    <Table label="Stock movements">
      <THead>
        <tr>
          <TH>When</TH>
          <TH>What</TH>
          {showItem ? <TH>Item</TH> : null}
          <TH>Location</TH>
          <TH className="text-right">Change</TH>
          <TH className="text-right">On hand after</TH>
          <TH>Who</TH>
          <TH>Reference</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.id}>
            <TD className="whitespace-nowrap text-ink-muted">{row.when}</TD>
            <TD className="min-w-44">
              <span className="font-semibold">{MOVEMENT_LABEL[row.type] ?? row.type}</span>
              {row.reason ? <span className="text-ink-muted">{` · ${REASON_LABEL[row.reason] ?? row.reason}`}</span> : null}
              {row.note ? <span className="block text-caption text-ink-muted">{row.note}</span> : null}
            </TD>
            {showItem ? (
              <TD className="min-w-40">
                <Link href={`/s/${slug}/items/${row.item.id}`} className="font-semibold hover:underline">{row.item.name}</Link>
                <span className="block text-caption tabular-nums text-ink-muted">{row.asset ? row.asset.assetTag : row.item.sku}</span>
              </TD>
            ) : null}
            <TD className="text-ink-muted">
              {row.location ?? "Off the shelf"}
              {!showItem && row.asset ? <Link href={`/s/${slug}/assets/${row.asset.id}`} className="block text-caption tabular-nums hover:underline">{row.asset.assetTag}</Link> : null}
            </TD>
            <TD className="text-right tabular-nums">
              <span className="font-semibold">{signed(row.quantity)}</span>
              {sideEffects(row) ? <span className="block text-caption text-ink-muted">{sideEffects(row)}</span> : null}
            </TD>
            <TD className="text-right tabular-nums">{row.location ? row.balanceAfter : "–"}</TD>
            <TD className="text-ink-muted">{row.actor}</TD>
            <TD className="whitespace-nowrap tabular-nums">
              {row.ref?.href ? <Link href={row.ref.href} className="font-semibold text-accent-text hover:underline">{row.ref.label}</Link> : (row.ref?.label ?? <span className="text-ink-muted">None</span>)}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
