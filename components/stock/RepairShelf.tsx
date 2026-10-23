"use client";

import { useState } from "react";
import Link from "next/link";
import { changeAssetStateAction } from "@/app/actions/stock";
import { useRunAction } from "@/components/catalogue/useRunAction";
import { CONDITION_LABEL } from "@/components/catalogue/words";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ResolveRepairDialog } from "./RepairDialogs";

export type RepairLevel = { key: string; itemId: string; item: string; sku: string; unit: string | null; locationId: string; location: string; quarantined: number; onHand: number };
export type RepairAsset = { id: string; assetTag: string; item: string; itemId: string; location: string | null; condition: keyof typeof CONDITION_LABEL };

/** Everything present but unusable: quantity units per location and serialized units under repair. */
export function RepairShelf({ slug, levels, assets, canAct }: { slug: string; levels: RepairLevel[]; assets: RepairAsset[]; canAct: boolean }) {
  const [resolving, setResolving] = useState<{ level: RepairLevel; outcome: "repair" | "scrap" } | null>(null);
  const [assetAction, setAssetAction] = useState<{ asset: RepairAsset; action: "repair" | "retire" } | null>(null);
  const runner = useRunAction();

  if (levels.length === 0 && assets.length === 0) return <EmptyState title="Nothing on the repair shelf.">Damaged returns and units sent for repair show up here.</EmptyState>;
  return (
    <div className="flex flex-col gap-6">
      {levels.length > 0 ? (
        <Card>
          <CardHeader title="Parts and tools by quantity" />
          <Table label="Units under repair by location">
            <THead><tr><TH>Item</TH><TH>Location</TH><TH className="text-right">Under repair</TH>{canAct ? <TH><span className="sr-only">Actions</span></TH> : null}</tr></THead>
            <TBody>
              {levels.map((level) => (
                <TR key={level.key}>
                  <TD><Link href={`/s/${slug}/items/${level.itemId}`} className="font-semibold hover:underline">{level.item}</Link><span className="block text-caption tabular-nums text-ink-muted">{level.sku}</span></TD>
                  <TD className="text-ink-muted">{level.location}</TD>
                  <TD className="text-right">{level.quarantined}{level.unit ? ` ${level.unit}` : ""}</TD>
                  {canAct ? (
                    <TD className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="sm" onClick={() => setResolving({ level, outcome: "repair" })}>Repaired…</Button>
                      <Button variant="dangerQuiet" size="sm" onClick={() => setResolving({ level, outcome: "scrap" })}>Scrap…</Button>
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}
      {assets.length > 0 ? (
        <Card>
          <CardHeader title="Serialized units" />
          <Table label="Assets under repair">
            <THead><tr><TH>Asset tag</TH><TH>Item</TH><TH>Location</TH><TH>Condition</TH>{canAct ? <TH><span className="sr-only">Actions</span></TH> : null}</tr></THead>
            <TBody>
              {assets.map((asset) => (
                <TR key={asset.id}>
                  <TD><Link href={`/s/${slug}/assets/${asset.id}`} className="font-semibold tabular-nums text-accent-text hover:underline">{asset.assetTag}</Link></TD>
                  <TD>{asset.item}</TD>
                  <TD className="text-ink-muted">{asset.location ?? "Off the shelf"}</TD>
                  <TD>{CONDITION_LABEL[asset.condition]}</TD>
                  {canAct ? (
                    <TD className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="sm" onClick={() => setAssetAction({ asset, action: "repair" })}>Repaired…</Button>
                      <Button variant="dangerQuiet" size="sm" onClick={() => setAssetAction({ asset, action: "retire" })}>Retire…</Button>
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}
      {resolving ? (
        <ResolveRepairDialog
          key={`${resolving.level.key}:${resolving.outcome}`}
          open
          onOpenChange={(open) => !open && setResolving(null)}
          slug={slug}
          itemId={resolving.level.itemId}
          unit={resolving.level.unit}
          initialOutcome={resolving.outcome}
          levels={[{ locationId: resolving.level.locationId, label: resolving.level.location, onHand: resolving.level.onHand, available: 0, quarantined: resolving.level.quarantined }]}
        />
      ) : null}
      <ConfirmDialog
        open={assetAction !== null}
        title={assetAction?.action === "repair" ? `Mark ${assetAction.asset.assetTag} repaired?` : `Retire ${assetAction?.asset.assetTag ?? "this asset"}?`}
        message={assetAction?.action === "repair" ? "It becomes available to lend again, in good condition." : "It leaves the books for good. Its history stays."}
        confirmLabel={assetAction?.action === "repair" ? "Mark repaired" : "Retire asset"}
        destructive={assetAction?.action === "retire"}
        loading={runner.pending}
        onCancel={() => {
          runner.reset();
          setAssetAction(null);
        }}
        onConfirm={() => assetAction && runner.run(() => changeAssetStateAction(slug, { assetId: assetAction.asset.id, action: assetAction.action }), assetAction.action === "repair" ? "Marked as repaired." : "Retired the asset.", () => setAssetAction(null))}
      >
        {runner.error ? <p role="alert" className="text-body-ui text-danger-fg">{runner.error}</p> : null}
      </ConfirmDialog>
    </div>
  );
}
