"use server";

import type { ZodType } from "zod";
import { domainFailure, spaceAction } from "@/lib/actionContext";
import { validationError, type ActionResult } from "@/lib/actionResult";
import { revalidatePath } from "@/lib/frontend/cache";
import { canApproveLoans, canBorrow, canIssueLoans, canResolveIncidents, type RoleHolder } from "@/lib/roles";
import { readHandoverForm } from "@/lib/desk/photos";
import {
  approveLoanSchema, issueLoanSchema, loanIdSchema, reasonSchema, rejectLoanSchema, requestLoanSchema, resolveIncidentSchema, returnLoanSchema,
  selfCheckoutSchema, selfReturnSchema, setDueSchema,
} from "@/lib/desk/loansSchemas";
import {
  approveStep, cancelStep, issueStep, rejectStep, renewStep, requestStep, resolveIncidentStep, returnStep, selfCheckoutStep, selfReturnStep, setDueStep, type StepContext,
} from "@/lib/desk/loanSteps";

type Bucket = "action" | "upload";

/** auth → space → capability → rate limit → schema → step → revalidate. */
async function runStep<I, T>(slug: unknown, allowed: (m: RoleHolder) => boolean, schema: ZodType<I>, raw: unknown, step: (ctx: StepContext, input: I) => Promise<T>, paths: (slug: string, input: I) => string[], bucket: Bucket = "action"): Promise<ActionResult<T>> {
  const { ctx, denied } = await spaceAction(slug, allowed, bucket);
  if (denied) return denied;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const data = await step({ spaceId: ctx.space.id, userId: ctx.user.id, timeZone: ctx.space.timezone }, parsed.data);
    for (const path of paths(ctx.space.slug, parsed.data)) revalidatePath(path);
    return { ok: true, data };
  } catch (error) {
    return domainFailure(error);
  }
}

const deskPaths = (slug: string, input: { loanId: string }) => [`/s/${slug}/loans`, `/s/${slug}/loans/${input.loanId}`, `/s/${slug}/my-loans/${input.loanId}`];
const memberPaths = (slug: string, input: { loanId: string }) => [`/s/${slug}/my-loans`, `/s/${slug}/my-loans/${input.loanId}`, `/s/${slug}/loans/${input.loanId}`, `/s/${slug}/catalogue`];

export async function approveLoanAction(slug: string, input: unknown): Promise<ActionResult<undefined>> {
  return runStep(slug, canApproveLoans, approveLoanSchema, input, async (ctx, data) => { await approveStep(ctx, data); return undefined; }, deskPaths);
}

export async function rejectLoanAction(slug: string, input: unknown): Promise<ActionResult<undefined>> {
  return runStep(slug, canApproveLoans, rejectLoanSchema, input, async (ctx, data) => { await rejectStep(ctx, data); return undefined; }, deskPaths);
}

export async function cancelLoanAction(slug: string, input: unknown): Promise<ActionResult<undefined>> {
  return runStep(slug, canApproveLoans, reasonSchema, input, async (ctx, data) => { await cancelStep(ctx, data); return undefined; }, deskPaths);
}

/** Hand an approved loan over: scans, photos and remarks in one FormData. */
export async function issueLoanAction(slug: string, formData: FormData): Promise<ActionResult<undefined>> {
  const { payload, photos } = readHandoverForm(formData);
  return runStep(slug, canIssueLoans, issueLoanSchema, payload, async (ctx, data) => { await issueStep(ctx, data, photos); return undefined; }, deskPaths, "upload");
}

export async function returnLoanAction(slug: string, formData: FormData): Promise<ActionResult<{ status: string }>> {
  const { payload, photos } = readHandoverForm(formData);
  return runStep(slug, canIssueLoans, returnLoanSchema, payload, (ctx, data) => returnStep(ctx, data, photos), deskPaths, "upload");
}

export async function renewLoanAction(slug: string, input: unknown): Promise<ActionResult<undefined>> {
  return runStep(slug, canIssueLoans, loanIdSchema, input, async (ctx, data) => { await renewStep(ctx, data.loanId); return undefined; }, deskPaths);
}

export async function setDueDateAction(slug: string, input: unknown): Promise<ActionResult<undefined>> {
  return runStep(slug, canIssueLoans, setDueSchema, input, async (ctx, data) => { await setDueStep(ctx, data); return undefined; }, deskPaths);
}

export async function resolveIncidentAction(slug: string, input: unknown): Promise<ActionResult<undefined>> {
  return runStep(slug, canResolveIncidents, resolveIncidentSchema, input, async (ctx, data) => { await resolveIncidentStep(ctx, data); return undefined; }, (s) => [`/s/${s}/loans`]);
}

/** A member sends their request tray. */
export async function requestLoanAction(slug: string, input: unknown): Promise<ActionResult<{ loanId: string }>> {
  return runStep(slug, canBorrow, requestLoanSchema, input, requestStep, (s) => [`/s/${s}/my-loans`, `/s/${s}/loans`]);
}

export async function selfCheckoutAction(slug: string, formData: FormData): Promise<ActionResult<{ loanId: string }>> {
  const { payload, photos } = readHandoverForm(formData);
  return runStep(slug, canBorrow, selfCheckoutSchema, payload, (ctx, data) => selfCheckoutStep(ctx, data, photos), (s) => [`/s/${s}/my-loans`, `/s/${s}/catalogue`, `/s/${s}/loans`], "upload");
}

export async function renewMyLoanAction(slug: string, input: unknown): Promise<ActionResult<undefined>> {
  return runStep(slug, canBorrow, loanIdSchema, input, async (ctx, data) => { await renewStep(ctx, data.loanId, true); return undefined; }, memberPaths);
}

export async function cancelMyLoanAction(slug: string, input: unknown): Promise<ActionResult<undefined>> {
  return runStep(slug, canBorrow, reasonSchema, input, async (ctx, data) => { await cancelStep(ctx, data, true); return undefined; }, memberPaths);
}

export async function selfReturnAction(slug: string, formData: FormData): Promise<ActionResult<{ status: string }>> {
  const { payload, photos } = readHandoverForm(formData);
  return runStep(slug, canBorrow, selfReturnSchema, payload, (ctx, data) => selfReturnStep(ctx, data, photos), memberPaths, "upload");
}
