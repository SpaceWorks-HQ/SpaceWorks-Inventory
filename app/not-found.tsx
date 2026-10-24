import Link from "next/link";
import { NotFoundPet } from "@/components/feedback/NotFoundPet";
import { Button } from "@/components/ui/button";

/** Patch, trotting along the bottom, is this page's one bold moment (docs/DESIGN.md "Easter eggs"). */
export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex max-w-[520px] flex-1 flex-col items-center justify-center gap-4 px-4 pb-40 pt-16 text-center">
      <NotFoundPet />
      <p className="text-label text-ink-muted">404</p>
      <h1 className="text-h1 text-ink">There&apos;s nothing here.</h1>
      <p className="text-body-ui text-ink-secondary">The page may have moved, or you may not have access to it. Check the link or head back to your space.</p>
      <Button asChild variant="primary">
        <Link href="/">Back to your space</Link>
      </Button>
      <p className="text-caption text-ink-muted">Patch is out looking for it too.</p>
    </main>
  );
}
