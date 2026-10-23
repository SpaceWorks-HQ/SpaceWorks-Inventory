"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SpaceRole } from "@prisma/client";
import { createInvitationAction } from "@/app/actions/members";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/feedback/ToastProvider";
import { roleLabel } from "@/lib/roles";

/** Invite the crew by email with a role; the role matrix is rendered beside it by the page. */
export function TeamStep({ slug, roles, members, pendingInvitations }: { slug: string; roles: SpaceRole[]; members: number; pendingInvitations: number }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SpaceRole>(roles.includes("STAFF") ? "STAFF" : roles[0] ?? "MEMBER");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  return (
    <Card padding="lg">
      <CardHeader
        title="Invite your team"
        description={`${members} ${members === 1 ? "person is" : "people are"} in this space${pendingInvitations > 0 ? `, ${pendingInvitations} invited` : ""}. Invitations are emailed and work for 7 days.`}
      />
      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await createInvitationAction(slug, { email, role });
            if (!result.ok) return setError(result.fieldErrors?.email?.[0] ?? result.error);
            setError(undefined);
            showToast(`Invitation sent to ${email}.`, "success");
            setEmail("");
            router.refresh();
          });
        }}
      >
        <Field label="Email" error={error}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maker@example.org" required />
        </Field>
        <Field label="Role">
          <Dropdown value={role} onChange={(e) => setRole(e.target.value as SpaceRole)}>
            {roles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </Dropdown>
        </Field>
        <Button type="submit" variant="primary" loading={pending}>Send invitation</Button>
      </form>
    </Card>
  );
}
