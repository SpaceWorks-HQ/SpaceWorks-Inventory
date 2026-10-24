import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { DomainError, type Actor, type ExecuteOptions, type InspectActivation, type OperationResult, type OpsAdapter } from "@spaceworks-hq/agents/helper";
import { prisma } from "@/lib/db";
import { sha256Hex } from "@/lib/crypto";
import { failureFor } from "@/lib/api/errors";
import { resolveAgentActor, policyVersion } from "./identity";
import { assertAgentOperation, OPERATION_DEFINITIONS, pendingDeskWork, performAgentOperation } from "./operations";
import { inventoryAgentActivation } from "./activation";
import { mentorForInventory } from "./mentor";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

function storedResult(value: unknown, replayed: boolean): OperationResult {
  return { ...(value as OperationResult), replayed };
}

/** The activation callback is trusted server configuration, never request/model data. */
export function createInventoryOpsAdapter(options: { activation?: InspectActivation } = {}): OpsAdapter {
  const activation = options.activation ?? inventoryAgentActivation;
  return {
    async snapshot(actor) {
      const membership = await resolveAgentActor(actor);
      return { policy: { version: policyVersion(membership.space) }, purpose: "Space Works Inventory: makerspace catalogue, stock and lending",
        desk: actor.role === "member" ? undefined : await pendingDeskWork(actor.tenantId),
        handover: { route: `/s/${membership.space.slug}/loans`, requiredPhotos: membership.space.minEvidencePhotos, qrScansRequired: true } };
    },
    async operations(actor) { await resolveAgentActor(actor); return OPERATION_DEFINITIONS.filter(value => value.roles.includes(actor.role)); },
    mentor: mentorForInventory,
    async execute(actor: Actor, name: string, input: Record<string, unknown>, command: ExecuteOptions): Promise<OperationResult> {
      await resolveAgentActor(actor);
      assertAgentOperation(actor, name);
      const active = await activation();
      if (active.status !== "merged" || !active.revision) throw new DomainError("AWAITING_MERGE", "Merge and verify this integration before agent business operations.", 409);
      if (!command.confirmed || !/^[A-Za-z0-9_.:-]{1,160}$/.test(command.actionKey) || !Number.isSafeInteger(command.expectedPolicyVersion)) {
        throw new DomainError("INVALID_INPUT", "Review the current policy and explicitly confirm a valid action key.", 400);
      }
      const hash = sha256Hex(canonical({ name, input, version: command.expectedPolicyVersion }));
      const key = { spaceId: actor.tenantId, actorId: actor.id, actionKey: command.actionKey };
      try {
        return await prisma.$transaction(async tx => {
          // Keep account disable serialized with the final authorization and effects.
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${actor.id} FOR SHARE`;
          await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "spaceId"=${actor.tenantId} AND "userId"=${actor.id} FOR SHARE`;
          await tx.$queryRaw`SELECT "id" FROM "Space" WHERE "id"=${actor.tenantId} FOR SHARE`;
          const current = await resolveAgentActor(actor, tx);
          const old = await tx.agentOperationReceipt.findUnique({ where: { spaceId_actorId_actionKey: key } });
          if (old) {
            if (old.requestHash !== hash) throw new DomainError("ACTION_KEY_REUSED", "This action key belongs to different reviewed inputs.", 409);
            return storedResult(old.result, true);
          }
          if (policyVersion(current.space) !== command.expectedPolicyVersion) throw new DomainError("POLICY_CHANGED", "Space criteria changed. Reload and review before confirming.", 409);
          const actionId = randomUUID();
          // The unique receipt is claimed before domain effects; concurrent duplicates wait on it.
          await tx.agentOperationReceipt.create({ data: { id: actionId, ...key, requestHash: hash, operation: name,
            policyVersion: BigInt(command.expectedPolicyVersion!), result: {} } });
          const result = await performAgentOperation(tx, actor, name, input);
          const outcome: OperationResult = { actionId, status: "succeeded", summary: `${name} completed by the native inventory workflow.`, result };
          await tx.agentOperationReceipt.update({ where: { id: actionId }, data: { result: outcome as unknown as Prisma.InputJsonValue } });
          return outcome;
        }, { timeout: 30_000, maxWait: 10_000 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          await resolveAgentActor(actor);
          const old = await prisma.agentOperationReceipt.findUnique({ where: { spaceId_actorId_actionKey: key } });
          if (old?.requestHash === hash) return storedResult(old.result, true);
          throw new DomainError("ACTION_KEY_REUSED", "This action key is already in use. Review its saved result.", 409);
        }
        if (error instanceof DomainError) throw error;
        const failure = failureFor(error);
        if (failure) throw new DomainError(failure.code, failure.message, failure.status);
        throw error;
      }
    },
  };
}
