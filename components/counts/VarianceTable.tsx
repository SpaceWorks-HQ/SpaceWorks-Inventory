import { Card, CardHeader, Chip } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { signed } from "@/lib/desk/format";
import type { CountLineView } from "@/lib/desk/countsDetail";

/** Lines whose count differs from what was expected: what posting will change. */
export function VarianceTable({ lines, threshold }: { lines: CountLineView[]; threshold: number | null }) {
  const differing = lines.filter((line) => line.variance !== null && line.variance !== 0);
  const limit = threshold ?? 0;
  return (
    <Card as="section" aria-label="Variances">
      <CardHeader title="Variances" description={differing.length ? `Posting sets stock to what was counted. Differences above ${limit} need someone who didn't count to post.` : "Everything counted matches what was expected."} />
      {differing.length ? (
        <Table label="Variances">
          <THead>
            <tr>
              <TH>Item</TH>
              <TH>Location</TH>
              <TH className="text-right">Expected</TH>
              <TH className="text-right">Counted</TH>
              <TH className="text-right">Difference</TH>
            </tr>
          </THead>
          <TBody>
            {differing.map((line) => (
              <TR key={line.id}>
                <TD><span className="font-semibold">{line.itemName}</span><span className="block text-caption text-ink-muted">{line.sku}</span></TD>
                <TD className="text-body-ui">{line.locationPath}</TD>
                <TD className="text-right">{line.expected}</TD>
                <TD className="text-right">{line.serialized ? line.scannedTags.length : line.countedQty}</TD>
                <TD className="text-right">
                  <Chip tone={Math.abs(line.variance!) > limit ? "danger" : "warning"}>{`${signed(line.variance!)}${line.unit ? ` ${line.unit}` : ""}`}</Chip>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : null}
    </Card>
  );
}
