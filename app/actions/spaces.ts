"use server";

import { z } from "zod";
import { revalidatePath } from "@/lib/frontend/cache";
import { prisma } from "@/lib/db";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { domainFailure } from "@/lib/actionContext";
import { actionError, RATE_LIMITED, type ActionResult } from "@/lib/actionResult";
import { getCurrentUser } from "@/lib/permissions";
import { joinSpace } from "@/lib/setup/publicCatalogue";

/** Join a space as a member from its public catalogue (when the space allows self-join). */
export async function joinSpaceAction(slug: string): Promise<ActionResult<{ slug: string; joined: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to join this space.");
  const parsed = z.string().min(1).max(64).safeParse(slug);
  if (!parsed.success) return actionError("This space isn't open to new members. Ask the space team for an invitation.");
  if (await isActionRateLimited("inviteAccept", user.id)) return actionError(RATE_LIMITED);
  try {
    const result = await prisma.$transaction((tx) => joinSpace(tx, parsed.data, user.id));
    revalidatePath("/", "layout");
    return { ok: true, data: result };
  } catch (error) {
    return domainFailure(error);
  }
}
