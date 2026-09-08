import { ModuleError, ModuleHeader } from "@/components/adminplus/module-shell";
import { serverAdminGet } from "@/lib/adminplus/server-api";

import { MessagesConsole, type SiteMessage } from "./_components/messages-console";

export default async function MessagesPage() {
  let messages: SiteMessage[] = [];
  try {
    const res = await serverAdminGet<{ messages: SiteMessage[] }>("/api/admin/site-messages?limit=100&offset=0");
    messages = res.messages ?? [];
  } catch (error) {
    return <ModuleError title="ข้อความ" error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader title="ข้อความ" description="ส่งข้อความเข้า inbox ให้ผู้ใช้เฉพาะกลุ่มหรือรายคน" />
      <MessagesConsole initialMessages={messages} />
    </div>
  );
}
