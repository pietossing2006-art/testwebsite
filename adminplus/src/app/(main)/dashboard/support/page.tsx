import { ModuleError, ModuleHeader } from "@/components/adminplus/module-shell";
import { serverAdminGet } from "@/lib/adminplus/server-api";

import { SupportConsole, type SupportAgent, type SupportSummary, type SupportTicket } from "./_components/support-console";

export default async function SupportPage() {
  let tickets: SupportTicket[] = [];
  let summary: SupportSummary | null = null;
  let agents: SupportAgent[] = [];

  try {
    const [ticketRes, agentRes] = await Promise.all([
      serverAdminGet<{ tickets: SupportTicket[]; summary: SupportSummary }>("/api/admin/support-tickets?limit=120"),
      serverAdminGet<{ users: SupportAgent[] }>("/api/admin/support-agents?limit=200"),
    ]);
    tickets = ticketRes.tickets ?? [];
    summary = ticketRes.summary ?? null;
    agents = agentRes.users ?? [];
  } catch (error) {
    return <ModuleError title="ซัพพอร์ต" error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader title="ซัพพอร์ต" description="จัดการ ticket ลูกค้า มอบหมายงาน และติดตาม SLA" />
      <SupportConsole initialTickets={tickets} initialSummary={summary} agents={agents} />
    </div>
  );
}
