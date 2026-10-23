"use client";

import { useRef, useState } from "react";
import { removeItemImageAction, reorderItemImagesAction, uploadItemImagesAction } from "@/app/actions/catalogue";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ItemThumb } from "./ItemThumb";
import { useRunAction } from "./useRunAction";

const MAX = 6;

/** Up to six photos; managers upload, reorder and remove them. The first photo is the thumbnail. */
export function ItemPhotos({ slug, itemId, name, photos, canEdit }: { slug: string; itemId: string; name: string; photos: Array<{ id: string; url: string }>; canEdit: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useRunAction();
  const change = useRunAction();
  const [removing, setRemoving] = useState<string | null>(null);
  const room = MAX - photos.length;

  const send = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (files.length > room) {
      upload.setError(`You can add ${room} more ${room === 1 ? "photo" : "photos"}.`);
      return;
    }
    const form = new FormData();
    for (const file of Array.from(files)) form.append("photos", file);
    upload.run(() => uploadItemImagesAction(slug, itemId, form), (data) => `Added ${data?.count ?? 0} ${data?.count === 1 ? "photo" : "photos"}.`, () => {
      if (input.current) input.current.value = "";
    });
  };

  const move = (index: number, by: -1 | 1) => {
    const ids = photos.map((photo) => photo.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved!);
    change.run(() => reorderItemImagesAction(slug, itemId, ids), "Saved the photo order.");
  };

  return (
    <Card>
      <CardHeader
        title="Photos"
        description={canEdit ? `PNG, JPEG or WebP, up to ${MAX}. The first one is the thumbnail.` : undefined}
        action={canEdit && room > 0 ? (
          <>
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" aria-label="Choose photos" onChange={(event) => send(event.target.files)} />
            <Button variant="secondary" size="sm" loading={upload.pending} loadingLabel="Adding photos" onClick={() => input.current?.click()}>Add photos</Button>
          </>
        ) : undefined}
      />
      {upload.error || change.error ? <p role="alert" className="mb-3 text-body-ui text-danger-fg">{upload.error ?? change.error}</p> : null}
      {photos.length === 0 ? (
        <p className="text-body-ui text-ink-muted">No photos yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex min-w-0 flex-col gap-1.5">
              <div className="aspect-square w-full"><ItemThumb name={name} src={photo.url} size="lg" /></div>
              {canEdit ? (
                <div className="flex flex-wrap gap-1">
                  {index > 0 ? <Button variant="quiet" size="sm" disabled={change.pending} onClick={() => move(index, -1)} aria-label={`Move photo ${index + 1} earlier`}>Earlier</Button> : null}
                  {index < photos.length - 1 ? <Button variant="quiet" size="sm" disabled={change.pending} onClick={() => move(index, 1)} aria-label={`Move photo ${index + 1} later`}>Later</Button> : null}
                  <Button variant="dangerQuiet" size="sm" onClick={() => setRemoving(photo.id)} aria-label={`Remove photo ${index + 1}`}>Remove</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        title="Remove this photo?"
        message="It is deleted for good."
        confirmLabel="Remove photo"
        loading={change.pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && change.run(() => removeItemImageAction(slug, removing), "Removed the photo.", () => setRemoving(null))}
      />
    </Card>
  );
}
