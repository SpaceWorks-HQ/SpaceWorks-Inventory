"use client";

import { useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";

type Props = {
  trigger: string;
  triggerVariant?: ButtonVariant;
  title: string;
  description?: ReactNode;
  textLabel: string;
  textRequired?: boolean;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  error: string | null;
  children?: ReactNode;
  /** Resolves true when the step succeeded (the dialog then closes). */
  onConfirm: (text: string) => Promise<boolean>;
};

/** A transfer step that needs a reason or note (reject, cancel, missing, send back), confirmed in a dialog. */
export function StepDialog({ trigger, triggerVariant = "secondary", title, description, textLabel, textRequired = false, confirmLabel, destructive = false, pending, error, children, onConfirm }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant}>{trigger}</Button>
      </DialogTrigger>
      <DialogContent size="md" role={destructive ? "alertdialog" : "dialog"}>
        <DialogHeader title={title} description={description} />
        <DialogBody className="flex flex-col gap-4">
          {children}
          <Field label={textLabel} optional={!textRequired}>
            <Textarea rows={3} maxLength={1000} value={text} onChange={(event) => setText(event.target.value)} />
          </Field>
          {error && open ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Keep it</Button>
          <Button
            variant={destructive ? "dangerSolid" : "primary"}
            loading={pending}
            disabled={textRequired && !text.trim()}
            onClick={async () => {
              if (await onConfirm(text)) {
                setOpen(false);
                setText("");
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
