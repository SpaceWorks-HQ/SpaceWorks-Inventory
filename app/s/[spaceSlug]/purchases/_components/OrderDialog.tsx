"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { movePurchaseAction } from "@/app/actions/purchases";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { emptyPayment, PaymentFields, paymentInput } from "./PaymentFields";
import type { PurchaseRow } from "./PurchasesTable";

/** Mark a purchase as bought: what it cost goes to the finance ledger. */
export function OrderDialog({ slug, currency, purchase, suppliers, onClose }: { slug: string; currency: string; purchase: PurchaseRow; suppliers: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [payment, setPayment] = useState(emptyPayment(purchase.supplierId));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await movePurchaseAction(slug, { purchaseId: purchase.id, step: "order", payment: paymentInput(payment) });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        showToast(result.error, "error");
        return;
      }
      showToast(`${purchase.reference} marked as ordered.`, "success");
      onClose();
      router.refresh();
    });

  return (
    <Dialog open onOpenChange={(next) => (!next && !pending ? onClose() : undefined)}>
      <DialogContent size="md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader title={`Order ${purchase.reference}`} description={`${purchase.name}: record what it cost. It goes into the finance ledger.`} />
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <PaymentFields currency={currency} value={payment} onChange={setPayment} suppliers={suppliers} errors={errors} />
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending}>Mark as ordered</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
