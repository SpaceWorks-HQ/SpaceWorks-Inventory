/** Build the FormData a handover Server Action expects: a JSON payload plus photo files. */
export function handoverFormData(payload: unknown, photos: readonly File[]): FormData {
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  for (const photo of photos) form.append("photos", photo, photo.name || "photo.jpg");
  return form;
}

export type ActionOutcome<T = unknown> = { ok: true; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
