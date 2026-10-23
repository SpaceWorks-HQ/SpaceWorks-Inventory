"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/display";

/** Shows a new API key or signing secret once, with a copy button. Closing forgets it. */
export function SecretDialog({ title, description, secret, onClose }: { title: string; description: string; secret: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog
      open={secret !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader title={title} description={description} />
        <DialogBody className="flex flex-col gap-3">
          <Callout tone="warning" title="Copy it now.">You won&apos;t see it again. If you lose it, create a new one.</Callout>
          <p className="code-text select-all break-all rounded-lg bg-inverse px-4 py-3 text-sm text-on-inverse" aria-label="Secret value">{secret}</p>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={async () => {
              if (!secret) return;
              try {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setCopied(false);
              onClose();
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
