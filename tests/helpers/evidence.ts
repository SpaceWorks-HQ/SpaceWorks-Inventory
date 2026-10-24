import type { StoredImage } from "@/lib/storage";

/** A fake stored photo under the space's evidence prefix (no bytes needed for workflow tests). */
export function photo(spaceId: string, n = 1): StoredImage {
  return { storageKey: `spaces/${spaceId}/evidence/${crypto.randomUUID()}/evidence-${n}.webp`, contentType: "image/webp", width: 800, height: 600, sizeBytes: 1234, sha256: "0".repeat(64) };
}

export function evidence(spaceId: string, remarks = "All good", count = 1) {
  return { photos: Array.from({ length: count }, (_, i) => photo(spaceId, i)), remarks, scannedCodes: [] as string[] };
}
