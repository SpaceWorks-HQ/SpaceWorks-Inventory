import "server-only";
import { inspectDevMerge } from "@spaceworks-hq/agents/review";
import type { HelperActivation } from "@spaceworks-hq/agents/helper";

/** Configuration is operator-owned. A browser/chat message cannot activate a host. */
export async function inventoryAgentActivation(): Promise<HelperActivation> {
  const number = Number(process.env.AGENTS_INTEGRATION_PR);
  const head = process.env.AGENTS_INTEGRATION_HEAD ?? "";
  const deployed = process.env.AGENTS_VERIFIED_REVISION ?? "";
  if (!Number.isSafeInteger(number) || number < 1 || !/^[a-f0-9]{40}$/.test(head) || !/^[a-f0-9]{40}$/.test(deployed)) return { status: "awaiting-merge" };
  const merged = await inspectDevMerge({ repository: "SpaceWorks-HQ/SpaceWorks-Inventory", number, expectedHeadSha: head });
  return merged.status === "merged" && merged.revision === deployed ? { status: "merged", revision: deployed } : { status: "awaiting-merge" };
}
