import { Chip } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { TransferLineView } from "./types";

const STATE_WORD = { ASSIGNED: "Assigned", DISPATCHED: "In transit", RECEIVED: "Received", DAMAGED: "Damaged", MISSING: "Missing", RETURNING: "Coming back", RETURNED: "Returned" } as const;
const COLUMNS: Array<[keyof TransferLineView, string]> = [
  ["requested", "Requested"], ["approved", "Approved"], ["dispatched", "Dispatched"], ["inTransit", "In transit"], ["received", "Received"],
  ["damaged", "Damaged"], ["missing", "Missing"], ["returning", "Sent back"], ["returned", "Returned"],
];

/** Every quantity of every line, with the asset tags that travel. */
export function TransferLinesTable({ lines }: { lines: TransferLineView[] }) {
  return (
    <Table label="Transfer lines">
      <THead>
        <tr>
          <TH>Item</TH>
          {COLUMNS.map(([key, label]) => <TH key={key} className="text-right">{label}</TH>)}
        </tr>
      </THead>
      <TBody>
        {lines.map((line) => (
          <TR key={line.id}>
            <TD className="min-w-48">
              <span className="block font-semibold">{line.itemName}</span>
              <span className="block text-caption text-ink-muted">{line.sku}{line.unit ? ` · ${line.unit}` : ""}</span>
              {line.assets.length ? (
                <span className="mt-1 flex flex-wrap gap-1">
                  {line.assets.map((asset) => <Chip key={asset.id} size="sm" tone={asset.state === "MISSING" || asset.state === "DAMAGED" ? "danger" : asset.state === "RECEIVED" || asset.state === "RETURNED" ? "success" : "neutral"}>{`${asset.tag} · ${STATE_WORD[asset.state]}`}</Chip>)}
                </span>
              ) : null}
            </TD>
            {COLUMNS.map(([key]) => {
              const value = line[key] as number;
              return <TD key={key} className={value ? "text-right" : "text-right text-ink-muted"}>{value}</TD>;
            })}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
