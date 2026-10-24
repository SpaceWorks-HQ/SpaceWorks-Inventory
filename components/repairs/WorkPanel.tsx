"use client";

import { saveRepairWorkAction } from "@/app/actions/repairs";
import { handoverFormData } from "@/components/desk/handoverForm";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { WorkForm } from "./WorkForm";

/** The assigned technician (or a manager on their behalf) records the work in the app. */
export function WorkPanel({ slug, currency, issueId, remarks, partsUsed, askedMinor }: { slug: string; currency: string; issueId: string; remarks: string; partsUsed: string; askedMinor: number | null }) {
  const { run, pending, error } = useActionRunner();
  return (
    <WorkForm
      currency={currency}
      remarks={remarks}
      partsUsed={partsUsed}
      askedMinor={askedMinor}
      pending={pending}
      error={error}
      onSubmit={(payload, photos) => void run(() => saveRepairWorkAction(slug, handoverFormData({ issueId, ...payload }, photos)), payload.markFixed ? "Marked fixed. A manager will verify it." : "Notes saved.")}
    />
  );
}
