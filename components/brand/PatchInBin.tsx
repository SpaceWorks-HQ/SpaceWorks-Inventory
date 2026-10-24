import { Patch } from "./Patch";

/**
 * Easter egg for an empty shelf: Patch peeks over the rim of an empty bin.
 * The bin is a flat token-coloured box in front of the artwork, so Patch is
 * never recoloured, mirrored or scaled; the peek plays once and rests under
 * reduced motion. Decorative only (aria-hidden), and the screen's one bold moment.
 */
export function PatchInBin() {
  return (
    <span aria-hidden className="relative mx-auto block w-[176px]" data-egg="empty-bin">
      <span className="sw-peek block overflow-hidden" style={{ height: 112 }}>
        <Patch pose="idle" size={112} className="-mb-8 block" />
      </span>
      <span className="relative -mt-3 block h-12 rounded-b-xl rounded-t-md border border-line-strong bg-surface">
        <span className="absolute inset-x-3 top-2 h-px bg-line" />
      </span>
    </span>
  );
}
