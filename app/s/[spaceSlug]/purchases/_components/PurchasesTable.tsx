"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis } from "lucide-react";
import type { PurchaseStatus } from "@prisma/client";
import { movePurchaseAction } from "@/app/actions/purchases";
import { useToast } from "@/components/feedback/ToastProvider";
import { PurchaseStatusChip } from "@/components/inventory/StatusChips";
import { IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/display";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney } from "@/lib/format/money";
import { ReceiveDialog } from "./ReceiveDialog";

export type PurchaseRow = {
  id: string;
  reference: string;
  name: string;
  sku: string | null;
  linked: boolean;
  quantity: number;
  status: PurchaseStatus;
  unitCostMinor: number | null;
  link: string | null;
  note: string | null;
  supplier: string | null;
  requestedBy: string | null;
  requestedLabel: string;
};

type Step = "approve" | "order" | "cancel";

const STEP_DONE: Record<Step, string> = { approve: "Purchase approved.", order: "Marked as ordered.", cancel: "Purchase cancelled." };

function Actions({ row, onStep, onReceive }: { row: PurchaseRow; onStep: (step: Step) => void; onReceive: () => void }) {
  const open = row.status === "REQUESTED" || row.status === "APPROVED" || row.status === "ORDERED";
  if (!open) return null;
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton label={`Actions for ${row.reference}`} size="sm"><Ellipsis /></IconButton>
      </MenuTrigger>
      <MenuContent align="end">
        {row.status === "REQUESTED" ? <MenuItem onSelect={() => onStep("approve")}>Approve</MenuItem> : null}
        {row.status !== "ORDERED" ? <MenuItem onSelect={() => onStep("order")}>Mark as ordered</MenuItem> : null}
        {row.status !== "REQUESTED" ? <MenuItem onSelect={onReceive}>Receive into stock</MenuItem> : null}
        <MenuItem danger onSelect={() => onStep("cancel")}>Cancel purchase</MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function PurchasesTable({ slug, currency, rows, manage, locations, filterLabel }: { slug: string; currency: string; rows: PurchaseRow[]; manage: boolean; locations: { id: string; label: string }[]; filterLabel: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [cancelling, setCancelling] = useState<PurchaseRow | null>(null);
  const [receiving, setReceiving] = useState<PurchaseRow | null>(null);

  const move = (row: PurchaseRow, step: Step) =>
    startTransition(async () => {
      const result = await movePurchaseAction(slug, { purchaseId: row.id, step });
      setCancelling(null);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast(STEP_DONE[step], "success");
      router.refresh();
    });

  if (rows.length === 0) return <EmptyState patch title={`Nothing ${filterLabel === "open" ? "open" : filterLabel} on the buy list.`}>Request a purchase when the space needs something.</EmptyState>;

  return (
    <>
      <Table label="Buy list">
        <THead>
          <tr>
            <TH>Purchase</TH>
            <TH>Item</TH>
            <TH className="text-right">Quantity</TH>
            <TH className="text-right">Unit cost</TH>
            <TH>Status</TH>
            <TH>Requested</TH>
            {manage ? <TH><span className="sr-only">Actions</span></TH> : null}
          </tr>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.id}>
              <TD className="whitespace-nowrap font-semibold tabular-nums">{row.reference}</TD>
              <TD className="min-w-[200px]">
                <span className="block font-semibold">{row.name}</span>
                <span className="block text-caption text-ink-muted">
                  {[row.sku ?? (row.linked ? null : "Not in the catalogue yet"), row.supplier].filter(Boolean).join(" · ")}
                </span>
                {row.link ? <a href={row.link} target="_blank" rel="noopener noreferrer nofollow" className="text-caption font-semibold text-accent-text underline-offset-4 hover:underline">Open link</a> : null}
                {row.note ? <span className="block text-caption text-ink-muted">{row.note}</span> : null}
              </TD>
              <TD className="text-right tabular-nums">{row.quantity}</TD>
              <TD className="whitespace-nowrap text-right tabular-nums">{row.unitCostMinor === null ? "—" : formatMoney(row.unitCostMinor, currency)}</TD>
              <TD><PurchaseStatusChip status={row.status} /></TD>
              <TD className="whitespace-nowrap text-ink-muted">
                <span className="block">{row.requestedLabel}</span>
                {row.requestedBy ? <span className="block text-caption">{row.requestedBy}</span> : null}
              </TD>
              {manage ? (
                <TD className="w-12 text-right">
                  <Actions row={row} onStep={(step) => (step === "cancel" ? setCancelling(row) : move(row, step))} onReceive={() => setReceiving(row)} />
                </TD>
              ) : null}
            </TR>
          ))}
        </TBody>
      </Table>
      <ConfirmDialog
        open={cancelling !== null}
        title={`Cancel ${cancelling?.reference ?? "this purchase"}?`}
        message="It stays in the history as cancelled. Request it again if it is still needed."
        confirmLabel="Cancel purchase"
        cancelLabel="Keep it"
        loading={pending}
        onCancel={() => setCancelling(null)}
        onConfirm={() => cancelling && move(cancelling, "cancel")}
      />
      {receiving ? <ReceiveDialog slug={slug} currency={currency} purchase={receiving} locations={locations} onClose={() => setReceiving(null)} /> : null}
    </>
  );
}
