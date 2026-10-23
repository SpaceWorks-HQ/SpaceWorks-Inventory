"use server";

import { z } from "zod";
import { spaceAction } from "@/lib/actionContext";
import { actionError, type ActionResult } from "@/lib/actionResult";
import { canViewStock } from "@/lib/roles";
import { scanTarget, type ScanTarget } from "@/lib/desk/scan";

const codeSchema = z.string().trim().min(1).max(300);

/** Resolve a scanned label inside this space for the scan page (one lookup per scan). */
export async function resolveScanAction(slug: string, code: unknown): Promise<ActionResult<ScanTarget>> {
  const { ctx, denied } = await spaceAction(slug, canViewStock, "scan");
  if (denied) return denied;
  const parsed = codeSchema.safeParse(code);
  if (!parsed.success) return actionError("Scan a label or type its code.");
  const target = await scanTarget(ctx.space.slug, ctx.space.id, parsed.data);
  if (!target) return actionError("That code isn't from this space. Check you're in the right space, or scan the label again.");
  return { ok: true, data: target };
}
