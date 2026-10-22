"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { confirmRazorpayPaymentAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void };
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

export type RazorpayCheckoutProps = {
  spaceSlug: string;
  paymentId: string;
  keyId: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  amountLabel: string;
  spaceName: string;
  description: string;
  prefill: { name: string; email: string };
  nonce: string | undefined;
};

/** Loads Razorpay's Checkout.js (only on the pay page) and confirms the result on the server. */
export function RazorpayCheckout(props: RazorpayCheckoutProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opened = useRef(false);
  const returnUrl = `/s/${props.spaceSlug}/pay/${props.paymentId}?return=1`;

  const open = useCallback(() => {
    const Razorpay = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
    if (!Razorpay) {
      setError("Couldn't load the payment window. Check your connection and try again.");
      return;
    }
    setError(null);
    new Razorpay({
      key: props.keyId,
      order_id: props.orderId,
      amount: props.amountMinor,
      currency: props.currency,
      name: props.spaceName,
      description: props.description,
      prefill: props.prefill,
      theme: { color: getComputedStyle(document.documentElement).getPropertyValue("--yy-primary").trim() || undefined },
      handler: async (response: RazorpayResponse) => {
        setBusy(true);
        const result = await confirmRazorpayPaymentAction(props.spaceSlug, {
          paymentId: props.paymentId,
          orderId: response.razorpay_order_id,
          gatewayPaymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        });
        if (!result.ok) setError(result.error);
        router.replace(returnUrl);
        router.refresh();
      },
      modal: { ondismiss: () => setBusy(false) },
    }).open();
  }, [props, returnUrl, router]);

  useEffect(() => {
    if (ready && !opened.current) {
      opened.current = true;
      open();
    }
  }, [ready, open]);

  return (
    <div className="space-y-4">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" nonce={props.nonce} onReady={() => setReady(true)} onError={() => setError("Couldn't load the payment window. Check your connection and try again.")} />
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <Button variant="primary" size="lg" loading={!ready || busy} loadingLabel={busy ? "Confirming the payment" : "Preparing the payment window"} onClick={open}>
        Pay {props.amountLabel}
      </Button>
    </div>
  );
}
