import "server-only";

import { DomainError } from "@/lib/domainError";
import { deleteObjects, storeImage, type StoredImage } from "@/lib/storage";

export const MAX_EVIDENCE_PHOTOS = 6;

/**
 * Split a handover form: a JSON `payload` field plus `photos` files. Empty
 * file inputs (size 0) are ignored. A malformed payload reads as null so the
 * caller's schema refuses it.
 */
export function readHandoverForm(formData: FormData): { payload: unknown; photos: File[] } {
  const raw = formData.get("payload");
  let payload: unknown = null;
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }
  const photos = formData.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
  return { payload, photos };
}

/**
 * Store evidence photos first (decoded, stripped and re-encoded by
 * lib/storage under the space's prefix), then run the handover. When the
 * handover fails, the stored photos are deleted again so nothing is left
 * behind; the error is rethrown for the action to map.
 */
export async function withEvidencePhotos<T>(spaceId: string, files: File[], run: (photos: StoredImage[]) => Promise<T>): Promise<T> {
  if (files.length > MAX_EVIDENCE_PHOTOS) throw new DomainError(`Attach at most ${MAX_EVIDENCE_PHOTOS} photos.`, "invalid");
  const stored: StoredImage[] = [];
  const discard = () => deleteObjects(stored.map((photo) => photo.storageKey)).catch(() => undefined);
  for (const file of files) {
    let result: Awaited<ReturnType<typeof storeImage>>;
    try {
      result = await storeImage({ spaceId, folder: "evidence", file });
    } catch (error) {
      await discard();
      throw error;
    }
    if (!result.ok) {
      await discard();
      throw new DomainError(result.error, "invalid");
    }
    stored.push(result.image);
  }
  try {
    return await run(stored);
  } catch (error) {
    await discard();
    throw error;
  }
}
