import { ModuleError, ModuleHeader } from "@/components/adminplus/module-shell";
import { serverAdminGet } from "@/lib/adminplus/server-api";

import { AutomationManager, type AutomationEvent, type AutomationRule } from "./_components/automation-manager";

export default async function AutomationPage() {
  let rules: AutomationRule[] = [];
  let events: AutomationEvent[] = [];

  try {
    const [rulesRes, eventsRes] = await Promise.all([
      serverAdminGet<{ rules: AutomationRule[] }>("/api/admin/workflow-automation/rules?limit=100&offset=0"),
      serverAdminGet<{ events: AutomationEvent[] }>("/api/admin/workflow-automation/events?limit=100"),
    ]);
    rules = rulesRes.rules ?? [];
    events = eventsRes.events ?? [];
  } catch (error) {
    return <ModuleError title="อัตโนมัติ" error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader title="อัตโนมัติ" description="ตั้งกฎ workflow และดูเหตุการณ์ที่ระบบจัดการอัตโนมัติ" />
      <AutomationManager initialRules={rules} initialEvents={events} />
    </div>
  );
}
