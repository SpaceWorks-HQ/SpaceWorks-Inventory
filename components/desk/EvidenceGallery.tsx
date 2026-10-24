import Image from "next/image";
import { Card, CardHeader, EmptyState } from "@/components/ui/display";

export type EvidenceItem = {
  id: string;
  kindLabel: string;
  remarks: string;
  scannedCount: number;
  actorName: string;
  whenLabel: string;
  photos: { id: string; url: string }[];
};

/**
 * Handover proof: who, when, what was scanned, remarks and photos (never
 * cropped; each opens full size). Only staff and the borrower reach a page
 * that renders it, and the photo route checks again.
 */
export function EvidenceGallery({ items, title = "Evidence" }: { items: EvidenceItem[]; title?: string }) {
  return (
    <Card as="section" aria-label={title}>
      <CardHeader title={title} description="Photos and scans recorded at each handover." />
      {items.length === 0 ? (
        <EmptyState className="border-0 bg-surface py-5">No handovers recorded yet.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-5">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 border-t border-line pt-4 first:border-t-0 first:pt-0">
              <p className="text-label text-ink">{item.kindLabel} <span className="font-normal text-ink-muted">by {item.actorName} · {item.whenLabel}</span></p>
              <p className="text-caption text-ink-muted">{item.scannedCount === 1 ? "1 label scanned" : `${item.scannedCount} labels scanned`}</p>
              {item.remarks ? <p className="whitespace-pre-line text-body-ui text-ink-secondary">{item.remarks}</p> : null}
              {item.photos.length ? (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {item.photos.map((photo, index) => (
                    <li key={photo.id}>
                      <a href={photo.url} target="_blank" rel="noreferrer" className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-line bg-surface">
                        <Image src={photo.url} alt={`${item.kindLabel} photo ${index + 1}, ${item.whenLabel}`} width={320} height={320} unoptimized className="max-h-full w-auto object-contain" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
