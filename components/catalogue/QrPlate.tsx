import { cn } from "@/lib/cn";

/**
 * A QR code on a white plate in both colour modes. The SVG is generated on
 * the server by the qrcode library from an opaque code (no user content), and
 * carries its own white background and quiet zone.
 */
export function QrPlate({ svg, label, className }: { svg: string; label: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("aspect-square w-full max-w-56 overflow-hidden rounded-lg border border-line [&_svg]:block [&_svg]:size-full", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
