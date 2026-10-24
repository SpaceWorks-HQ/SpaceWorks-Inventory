"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSetUserDisabled, adminSetSpaceArchived } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/feedback/ToastProvider";

export function UserDisableButton({ userId, disabled, self }: { userId: string; disabled: boolean; self: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  if (self) return null;
  return (
    <Button
      size="sm"
      variant={disabled ? "secondary" : "dangerOutline"}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await adminSetUserDisabled({ userId, disabled: !disabled });
          if (!result.ok) showToast(result.error, "error");
          else router.refresh();
        })
      }
    >
      {disabled ? "Enable" : "Disable"}
    </Button>
  );
}

export function SpaceArchiveButton({ spaceId, archived }: { spaceId: string; archived: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={archived ? "secondary" : "dangerOutline"}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await adminSetSpaceArchived({ spaceId, archived: !archived });
          if (!result.ok) showToast(result.error, "error");
          else router.refresh();
        })
      }
    >
      {archived ? "Restore" : "Archive"}
    </Button>
  );
}
