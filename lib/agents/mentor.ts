import "server-only";
import { DomainError, type Actor } from "@spaceworks-hq/agents/helper";
import { planProject, type MentorCatalogueItem, type MentorPlan } from "@spaceworks-hq/agents/mentor";
import { createCodexMentorPlanner } from "@spaceworks-hq/agents/codex";
import { prisma } from "@/lib/db";
import { availabilityFor, availabilityOf } from "@/lib/inventory/availability";
import { resolveAgentActor, policyVersion } from "./identity";

/** Explicit, manager-maintained catalogue tags are evidence, not compatibility certification. */
export function mentorTagMetadata(tags: string[]) {
  const values = (prefix: string) => tags.filter(tag => tag.startsWith(prefix)).map(tag => tag.slice(prefix.length).trim()).filter(Boolean);
  return { capabilities: values("capability:"), interfaces: values("interface:"), voltage: values("voltage:")[0] };
}

export async function inventoryMentorContext(actor: Actor) {
  const membership = await resolveAgentActor(actor);
  if (actor.role === "member") throw new DomainError("FORBIDDEN", "Project mentoring requires a staff or inventory manager account.", 403);
  const items = await prisma.item.findMany({ where: { spaceId: actor.tenantId, archivedAt: null }, orderBy: { id: "asc" }, take: 1000,
    select: { id: true, name: true, tags: true, consumable: true, lendable: true, stockLevels: { select: { location: { select: { name: true } } }, take: 4 } } });
  const availability = await availabilityFor(actor.tenantId, items.map(item => item.id));
  const catalogue: MentorCatalogueItem[] = items.flatMap(item => {
    const mentor = mentorTagMetadata(item.tags);
    if (!mentor.capabilities.length) return [];
    return [{ id: item.id, name: item.name.slice(0, 160), kind: item.consumable ? "consumable" as const : "equipment" as const,
      available: availabilityOf(availability, item.id).available,
      location: item.stockLevels.map(level => level.location.name).join(", ").slice(0, 200) || "No stock location recorded",
      mentor: { ...mentor, notes: "Capabilities come from manager-maintained catalogue tags. Verify the part datasheet, physical condition and project compatibility." } }];
  });
  return { items: catalogue, policyVersion: policyVersion(membership.space), slug: membership.space.slug };
}

/** Read-only planning; native app handoffs preserve consumable and evidence semantics. */
export async function mentorForInventory(actor: Actor, input: Record<string, unknown>): Promise<MentorPlan> {
  const context = await inventoryMentorContext(actor);
  let plan: MentorPlan;
  if (process.env.AGENTS_MENTOR === "codex") {
    if (process.env.AGENTS_CODEX_LOCAL_PROCESS_ACK !== "true" || !process.env.AGENTS_CODEX_SCRATCH_DIR) {
      throw new DomainError("MENTOR_CONFIGURATION", "An operator must configure the private local Codex worker before model mentoring is enabled.", 503);
    }
    const planner = createCodexMentorPlanner({ workingDirectory: process.env.AGENTS_CODEX_SCRATCH_DIR,
      acknowledgeLocalProcessAccess: true, model: process.env.AGENTS_CODEX_MENTOR_MODEL ?? "gpt-6-luna" });
    plan = await planner(input, context);
  } else plan = planProject(input, context);
  // A model may take minutes: reauthorize and refresh stock before disclosing its result.
  const fresh = await inventoryMentorContext(actor);
  const refreshed = planProject({ ...input, requirements: plan.requirements.map(({ capability, quantity }) => ({ capability, quantity })) }, fresh);
  refreshed.requirements.forEach((requirement, index) => { requirement.source = plan.requirements[index]?.source ?? requirement.source; });
  refreshed.questions = [...new Set([...plan.questions, ...refreshed.questions])].slice(0, 20);
  refreshed.warnings = [...new Set([...plan.warnings, ...refreshed.warnings])].slice(0, 19);
  plan = refreshed;
  for (const line of plan.lines) for (const candidate of [line.primary, ...line.alternatives]) {
    if (!candidate) continue;
    candidate.proposal = null;
    candidate.handoff = { path: `/s/${encodeURIComponent(fresh.slug)}/items/${encodeURIComponent(candidate.itemId)}`,
      label: "Review this item in Inventory", reason: "Use the native catalogue and lending desk. Borrowing, approvals, payments, physical scans and required photos follow the space's policy." };
  }
  plan.warnings.push("This host offers native app handoffs rather than direct mentor stock taking. No stock, reservation or loan is changed by a mentor plan.");
  return plan;
}
