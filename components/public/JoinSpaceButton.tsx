"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinSpaceAction } from "@/app/actions/spaces";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/feedback/ToastProvider";

/** Signed-in visitors join as a member, then land on the space's borrow page. */
export function JoinSpaceButton({ slug, spaceName }: { slug: string; spaceName: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="primary"
      loading={pending}
      onClick={() => startTransition(async () => {
        const result = await joinSpaceAction(slug);
        if (!result.ok) return showToast(result.error, "error");
        showToast(result.data?.joined ? `You joined ${spaceName}.` : `You're already a member of ${spaceName}.`, "success");
        router.push(`/s/${result.data?.slug ?? slug}/catalogue`);
      })}
    >
      Join this space
    </Button>
  );
}
