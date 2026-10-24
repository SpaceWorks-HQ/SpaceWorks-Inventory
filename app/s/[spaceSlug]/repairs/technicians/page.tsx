import type { Metadata } from "next";
import { MessagingCard } from "@/components/repairs/MessagingCard";
import { TechnicianDialog } from "@/components/repairs/TechnicianDialog";
import { TechniciansTable } from "@/components/repairs/TechniciansTable";
import { PageHeader, SectionHeading } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/permissions";
import { chatSettingsView } from "@/lib/repairs";

export const metadata: Metadata = { title: "Technicians" };

export default async function TechniciansPage({ params }: PageProps<"/s/[spaceSlug]/repairs/technicians">) {
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

  return (
    <ListLayout
      header={<PageHeader title="Technicians" description="Who repairs things for this space: members with the Technician role (or staff) and external contacts. Repair requests go to the ones you choose." actions={<TechnicianDialog slug={space.slug} members={candidates} />} />}
    >
      <TechniciansTable slug={space.slug} rows={rows} />
      <div className="flex flex-col gap-4">
        <SectionHeading title="Messages to technicians" description="Every request is emailed. Add a Telegram bot or WhatsApp Business number to message technicians there too." />
        <MessagingCard slug={space.slug} settings={messaging} />
      </div>
    </ListLayout>
  );
}
