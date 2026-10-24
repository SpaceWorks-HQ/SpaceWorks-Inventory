"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSpaceAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Callout, DangerZone } from "@/components/ui/display";
import { useToast } from "@/components/feedback/ToastProvider";

/** Inventory managers delete the space after typing its address; everyone else sees who can. */
export function DeleteSpaceZone({ slug, spaceName, canDelete }: { slug: string; spaceName: string; canDelete: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!canDelete) {
    return <Callout tone="info" title="Only inventory managers can delete this space.">Ask an inventory manager if this space should be closed. Archiving by the instance admin keeps everything and can be undone.</Callout>;
  }
  return (
    <>
      <DangerZone
        title="Delete this space"
        description="Removes every item, location, loan, transfer, photo and member of this space for good. It can't be undone. Download any reports you need first."
        action={<Button variant="danger" onClick={() => setOpen(true)}>Delete space</Button>}
      />
      <ConfirmDialog
        open={open}
        title={`Delete ${spaceName}?`}
        message="Members lose access at once. Open transfers with other spaces must be finished or cancelled first."
        confirmLabel="Delete space"
        confirmText={slug}
        loading={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          startTransition(async () => {
            const result = await deleteSpaceAction(slug, { confirm: slug });
            if (!result.ok) {
              showToast(result.error, "error");
              return;
            }
            setOpen(false);
            showToast("Space deleted.", "success");
            router.push("/");
            router.refresh();
          })
        }
      />
    </>
  );
}
