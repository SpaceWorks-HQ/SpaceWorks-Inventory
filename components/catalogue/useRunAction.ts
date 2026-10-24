"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/feedback/ToastProvider";
import type { ActionResult } from "@/lib/actionResult";

/**
 * Run a Server Action: keep the error for the form, toast the success and
 * refresh the page data. Returns the result so callers can close dialogs.
 */
export function useRunAction() {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const run = <T,>(action: () => Promise<ActionResult<T>>, success: string | ((data: T | undefined) => string), onDone?: (data: T | undefined) => void) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setError(null);
      setFieldErrors({});
      showToast(typeof success === "function" ? success(result.data) : success, "success");
      onDone?.(result.data);
      router.refresh();
    });
  };

  const reset = () => {
    setError(null);
    setFieldErrors({});
  };

  return { pending, error, fieldErrors, run, reset, setError };
}
