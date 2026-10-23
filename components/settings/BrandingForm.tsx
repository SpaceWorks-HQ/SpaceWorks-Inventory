"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeSpaceLogoAction, uploadSpaceLogoAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Card, SettingsRow } from "@/components/ui/display";
import { Field } from "@/components/ui/field";
import { controlClasses } from "@/components/ui/styles";
import { useToast } from "@/components/feedback/ToastProvider";

/** Space logo: shown on the public catalogue and loan slips. Square images look best. */
export function BrandingForm({ slug, spaceName, logoUrl }: { slug: string; spaceName: string; logoUrl: string | null }) {
  const router = useRouter();
  const { showToast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const finish = (result: { ok: boolean; error?: string }, success: string) => {
    if (!result.ok) {
      setError(result.error);
      showToast(result.error ?? "Couldn't save. Try again.", "error");
      return;
    }
    setError(undefined);
    if (input.current) input.current.value = "";
    showToast(success, "success");
    router.refresh();
  };

  return (
    <Card padding="lg">
      <SettingsRow title="Logo" description="Shown on the public catalogue and on loan slips. A square PNG, JPEG or WebP works best; it's resized to 512 pixels.">
        <div className="flex flex-col gap-4">
          <div className="flex size-24 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- served by an authorised route, not the image optimiser
              <img src={logoUrl} alt={`${spaceName} logo`} className="size-full object-contain" />
            ) : (
              <span className="px-2 text-center text-caption text-ink-muted">No logo yet</span>
            )}
          </div>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              startTransition(async () => finish(await uploadSpaceLogoAction(slug, data), "Logo saved."));
            }}
          >
            <Field label="Logo image" error={error} className="min-w-0 flex-1">
              <input ref={input} type="file" name="logo" accept="image/png,image/jpeg,image/webp" required className={controlClasses} />
            </Field>
            <Button type="submit" variant="primary" loading={pending}>Upload logo</Button>
          </form>
          {logoUrl ? (
            <div>
              <Button variant="dangerQuiet" disabled={pending} onClick={() => startTransition(async () => finish(await removeSpaceLogoAction(slug), "Logo removed."))}>
                Remove logo
              </Button>
            </div>
          ) : null}
        </div>
      </SettingsRow>
    </Card>
  );
}
