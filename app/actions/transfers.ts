"use server";

import type { z } from "zod";
import { revalidatePath } from "@/lib/frontend/cache";
import { domainFailure, spaceAction } from "@/lib/actionContext";
import { validationError, type ActionResult } from "@/lib/actionResult";
import type { SpaceContext } from "@/lib/permissions";
import { canApproveTransfers, canHandleTransfers, canRequestTransfers, type RoleHolder } from "@/lib/roles";
import { readHandoverForm } from "@/lib/desk/photos";
import {
  approveSchema, cancelSchema, dispatchSchema, missingSchema, reasonSchema, receiveReturnSchema, receiveSchema, requestTransferSchema, sendBackSchema,
} from "@/lib/desk/transferSchemas";
import {
  approveStep, cancelStep, dispatchStep, missingStep, receiveReturnStep, receiveStep, rejectStep, requestTransferStep, sendBackStep,
} from "@/lib/desk/transferSteps";

type Ctx = SpaceContext;

/** Shared shape of every transfer step: capability in this space → schema → service → refresh both lists. */
async function step<S extends z.ZodTypeAny>(slug: unknown, allowed: (m: RoleHolder) => boolean, schema: S, input: unknown, run: (ctx: Ctx, data: z.output<S>) => Promise<unknown>, bucket: "action" | "upload" = "action"): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, allowed, bucket);
  if (denied) return denied;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await run(ctx, parsed.data);
  } catch (error) {
    return domainFailure(error);
  }
  revalidatePath(`/s/${ctx.space.slug}/transfers`, "layout");
  return { ok: true };
}

const desk = (ctx: Ctx) => ({ space: { id: ctx.space.id, timezone: ctx.space.timezone }, userId: ctx.user.id });

/** Raise a transfer: a move inside this space, a push to another space, or a pull from one that shares stock. */
export async function requestTransferAction(slug: string, input: unknown): Promise<ActionResult<{ transferId: string }>> {
  const { ctx, denied } = await spaceAction(slug, canRequestTransfers);
  if (denied) return denied;
  const parsed = requestTransferSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const transfer = await requestTransferStep(desk(ctx), parsed.data);
    revalidatePath(`/s/${ctx.space.slug}/transfers`, "layout");
    return { ok: true, data: { transferId: transfer.id } };
  } catch (error) {
    return domainFailure(error);
  }
}

export async function approveTransferAction(slug: string, input: unknown): Promise<ActionResult> {
  return step(slug, canApproveTransfers, approveSchema, input, (ctx, data) => approveStep(desk(ctx), data));
}

export async function rejectTransferAction(slug: string, input: unknown): Promise<ActionResult> {
  return step(slug, canApproveTransfers, reasonSchema, input, (ctx, data) => rejectStep(desk(ctx), data));
}

export async function cancelTransferAction(slug: string, input: unknown): Promise<ActionResult> {
  return step(slug, canHandleTransfers, cancelSchema, input, (ctx, data) => cancelStep(desk(ctx), data));
}

/** FormData: `payload` (JSON) plus `photos`. */
export async function dispatchTransferAction(slug: string, formData: FormData): Promise<ActionResult> {
  const { payload, photos } = readHandoverForm(formData);
  return step(slug, canHandleTransfers, dispatchSchema, payload, (ctx, data) => dispatchStep(desk(ctx), data, photos), "upload");
}

/** FormData: `payload` (JSON) plus `photos`. */
export async function receiveTransferAction(slug: string, formData: FormData): Promise<ActionResult> {
  const { payload, photos } = readHandoverForm(formData);
  return step(slug, canHandleTransfers, receiveSchema, payload, (ctx, data) => receiveStep(desk(ctx), data, photos), "upload");
}

export async function declareMissingAction(slug: string, input: unknown): Promise<ActionResult> {
  return step(slug, canHandleTransfers, missingSchema, input, (ctx, data) => missingStep(desk(ctx), data));
}

export async function sendBackAction(slug: string, input: unknown): Promise<ActionResult> {
  return step(slug, canHandleTransfers, sendBackSchema, input, (ctx, data) => sendBackStep(desk(ctx), data));
}

/** FormData: `payload` (JSON) plus `photos`. */
export async function receiveReturnAction(slug: string, formData: FormData): Promise<ActionResult> {
  const { payload, photos } = readHandoverForm(formData);
  return step(slug, canHandleTransfers, receiveReturnSchema, payload, (ctx, data) => receiveReturnStep(desk(ctx), data, photos), "upload");
}
