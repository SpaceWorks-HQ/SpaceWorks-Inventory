"use client";

import { useEffect, useState } from "react";
import { qrCodeAction } from "@/app/actions/catalogue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { QrPlate } from "./QrPlate";

export type QrTarget = { kind: "location" | "kit" | "container"; id: string; title: string; printHref: string };

/** Shows one QR code, fetched when the dialog opens, with a link to print its label. */
export function QrDialog({ slug, target, onClose }: { slug: string; target: QrTarget | null; onClose: () => void }) {
  const [result, setResult] = useState<{ key: string; svg: string | null; error: string | null } | null>(null);
  const key = target ? `${target.kind}:${target.id}` : "";

  useEffect(() => {
    if (!target) return;
    let current = true;
    qrCodeAction(slug, { kind: target.kind, id: target.id }).then((response) => {
      if (current) setResult({ key, svg: response.ok ? response.data!.svg : null, error: response.ok ? null : response.error });
    });
    return () => {
      current = false;
    };
  }, [key, slug, target]);

  const shown = result?.key === key ? result : null;
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader title={target?.title ?? "QR code"} description="Scanning it opens this record." />
        <DialogBody className="flex justify-center">
          {shown?.svg ? <QrPlate svg={shown.svg} label={`QR code for ${target?.title ?? ""}`} /> : shown?.error ? <p role="alert" className="text-body-ui text-danger-fg">{shown.error}</p> : <span role="status" className="block"><Skeleton className="size-48 rounded-lg" /><span className="sr-only">Getting the QR code</span></span>}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {target ? <Button asChild variant="primary"><a href={target.printHref} target="_blank" rel="noopener">Print label</a></Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
