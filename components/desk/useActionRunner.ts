"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/feedback/ToastProvider";
import type { ActionOutcome } from "./handoverForm";

/**
 * Run a Server Action from a desk form: shows the refusal inline, toasts the
 * success and refreshes the page data. `run` resolves true on success.
 */
export function useActionRunner() {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = <T,>(work: () => Promise<ActionOutcome<T>>, success: string, after?: (data: T | undefined) => void) =>
    new Promise<boolean>((resolve) => {
      setError(null);
      start(async () => {
        const result = await work();
        if (!result.ok) {
          setError(result.error);
          resolve(false);
          return;
        }
        showToast(success, "success");
        if (after) after(result.data);
        else router.refresh();
        resolve(true);
      });
    });
  return { run, pending, error, setError };
}
