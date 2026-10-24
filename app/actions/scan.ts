"use server";

import { z } from "zod";
import { spaceAction } from "@/lib/actionContext";
import { actionError, type ActionResult } from "@/lib/actionResult";
import { canBorrow, canHandleTransfers, canIssueLoans, canViewStock } from "@/lib/roles";
import { scanTarget, type ScanTarget } from "@/lib/desk/scan";
import { resolveDispatchScan, resolveIssueScan, resolveSelfCheckoutScan, type HandoverScan, type SelfCheckoutScan } from "@/lib/desk/handoverScans";

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

const handoverSchema = z.object({ recordId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/), code: codeSchema });

/**
 * Resolve a code the issue scanner didn't preload (spaces with many tags).
 * Null means "not a label this handover can use"; the issue step re-checks
 * every code when it is saved.
 */
export async function resolveIssueScanAction(slug: string, input: unknown): Promise<ActionResult<HandoverScan | null>> {
  const { ctx, denied } = await spaceAction(slug, canIssueLoans, "scan");
  if (denied) return denied;
  const parsed = handoverSchema.safeParse(input);
  if (!parsed.success) return actionError("Scan a label or type its code.");
  return { ok: true, data: await resolveIssueScan(ctx.space.id, parsed.data.recordId, parsed.data.code) };
}

/** The same for asset tags at transfer dispatch (this space is the source). */
export async function resolveDispatchScanAction(slug: string, input: unknown): Promise<ActionResult<HandoverScan | null>> {
  const { ctx, denied } = await spaceAction(slug, canHandleTransfers, "scan");
  if (denied) return denied;
  const parsed = handoverSchema.safeParse(input);
  if (!parsed.success) return actionError("Scan a label or type its code.");
  return { ok: true, data: await resolveDispatchScan(ctx.space.id, parsed.data.recordId, parsed.data.code) };
}

/** The same for a member's self-checkout scanner (items marked for self-checkout only). */
export async function resolveSelfCheckoutScanAction(slug: string, input: unknown): Promise<ActionResult<SelfCheckoutScan | null>> {
  const { ctx, denied } = await spaceAction(slug, canBorrow, "scan");
  if (denied) return denied;
  const parsed = z.object({ code: codeSchema }).safeParse(input);
  if (!parsed.success) return actionError("Scan a label or type its code.");
  return { ok: true, data: await resolveSelfCheckoutScan(ctx.space.id, parsed.data.code) };
}
