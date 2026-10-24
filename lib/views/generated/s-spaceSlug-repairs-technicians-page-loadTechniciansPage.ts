// Generated from app/s/[spaceSlug]/repairs/technicians/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/permissions";
import { chatSettingsView } from "@/lib/repairs";

export async function loadTechniciansPage({ params }: PageProps<"/s/[spaceSlug]/repairs/technicians">) {
const { spaceSlug } = await params;
const { space } = await requireSpace(spaceSlug, "MANAGER");
const [technicians, members, messaging, open] = await Promise.all([
    prisma.technician.findMany({ where: { spaceId: space.id }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.membership.findMany({ where: { spaceId: space.id, status: "ACTIVE", role: { in: ["TECHNICIAN", "STAFF", "MANAGER"] }, user: { technicianEntries: { none: { spaceId: space.id } } } }, select: { userId: true, role: true, user: { select: { name: true, email: true } } }, orderBy: { joinedAt: "asc" } }),
    chatSettingsView(space.id),
    prisma.repairIssue.groupBy({ by: ["assignedTechnicianId"], where: { spaceId: space.id, status: { in: ["ASSIGNED", "FIXED"] } }, _count: { _all: true } }),
  ]);
const working = new Map(open.map((row) => [row.assignedTechnicianId, row._count._all]));
const rows = technicians.map((technician) => ({
    id: technician.id,
    kind: technician.kind,
    name: technician.name,
    email: technician.email,
    phone: technician.phone,
    whatsapp: technician.whatsapp,
    telegramChatId: technician.telegramChatId,
    skills: technician.skills,
    preferredChannel: technician.preferredChannel,
    notes: technician.notes,
    active: technician.active,
    working: working.get(technician.id) ?? 0,
  }));
const candidates = members.map((member) => ({ userId: member.userId, label: `${member.user.name ?? member.user.email} (${member.role.toLowerCase()})` }));
return viewDto({ space, members, messaging, rows, candidates } as const);
}
