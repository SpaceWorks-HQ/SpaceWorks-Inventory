"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateProfile } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/feedback/ToastProvider";

type Profile = { name: string; phone: string };

export function ProfileForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await updateProfile(values);
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
            showToast(result.error, "error");
            return;
          }
          setErrors({});
          showToast("Profile saved.", "success");
          router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.name?.[0]}>
          <Input value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} maxLength={80} autoComplete="name" />
        </Field>
        <Field label="Phone" optional helperText="Staff use it to reach you about overdue loans." error={errors.phone?.[0]}>
          <Input value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} maxLength={32} autoComplete="tel" inputMode="tel" />
        </Field>
      </div>
      <Button type="submit" variant="primary" loading={pending} className="self-start">Save profile</Button>
    </form>
  );
}
