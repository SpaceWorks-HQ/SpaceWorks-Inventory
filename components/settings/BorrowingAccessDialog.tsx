"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BorrowingStatus } from "@prisma/client";
import { setBorrowingAccessAction } from "@/app/actions/members";
import { Button } from "@/components/ui/button";
import { Radio, RadioGroup } from "@/components/ui/choice";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/feedback/ToastProvider";

const OPTIONS: { value: BorrowingStatus; label: string; description: string }[] = [
  { value: "GOOD", label: "Can borrow", description: "Normal access. Automatic pauses for overdue or lost items still apply." },
  { value: "RESTRICTED", label: "Restricted", description: "No new loans for now. Items already out can still come back." },
  { value: "SUSPENDED", label: "Suspended", description: "No borrowing until a manager lifts it. Use for serious or repeated problems." },
];

export type BorrowingTarget = { membershipId: string; name: string; borrowingStatus: BorrowingStatus; borrowingNote: string | null; borrowingAuto: boolean; memberNumber: string | null };

/** Inventory managers set a member's borrowing standing (with a reason the member sees) and membership number. */
export function BorrowingAccessDialog({ slug, member, onClose }: { slug: string; member: BorrowingTarget; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [status, setStatus] = useState<BorrowingStatus>(member.borrowingStatus);
  const [note, setNote] = useState(member.borrowingNote ?? "");
  const [memberNumber, setMemberNumber] = useState(member.memberNumber ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const save = () => {
    if (status !== "GOOD" && !note.trim()) {
      setErrors({ note: "Add a short reason the member will see." });
      return;
    }
    startTransition(async () => {
      const result = await setBorrowingAccessAction(slug, { membershipId: member.membershipId, status, note, memberNumber });
      if (!result.ok) {
        setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([key, list]) => [key, list[0] ?? ""])));
        showToast(result.error, "error");
        return;
      }
      showToast("Borrowing access saved.", "success");
      onClose();
      router.refresh();
    });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent size="md">
        <DialogHeader
          title={`Borrowing access for ${member.name}`}
          description={member.borrowingAuto && member.borrowingStatus !== "GOOD" ? "Paused automatically. It lifts on its own once the overdue or lost item is dealt with; a change here replaces it." : "The member sees the reason on their loans page."}
        />
        <DialogBody className="flex flex-col gap-4">
          <RadioGroup aria-label="Borrowing standing" value={status} onValueChange={(value) => setStatus(value as BorrowingStatus)}>
            {OPTIONS.map((option) => <Radio key={option.value} value={option.value} label={option.label} description={option.description} />)}
          </RadioGroup>
          <Field label="Reason" optional={status === "GOOD"} helperText={status === "GOOD" ? "Not needed when the member can borrow." : "Shown to the member."} error={errors.note}>
            <Textarea rows={2} maxLength={300} value={note} disabled={status === "GOOD"} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Field label="Membership number" optional helperText="Printed on loan slips. Some spaces need it before members can borrow." error={errors.memberNumber}>
            <Input value={memberNumber} maxLength={40} onChange={(e) => setMemberNumber(e.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={pending}>Save access</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
