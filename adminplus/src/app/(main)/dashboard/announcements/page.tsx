import { ModuleError, ModuleHeader } from "@/components/adminplus/module-shell";
import { serverAdminGet } from "@/lib/adminplus/server-api";

import { AnnouncementsManager, type Announcement } from "./_components/announcements-manager";

export default async function AnnouncementsPage() {
  let announcements: Announcement[] = [];
  try {
    const res = await serverAdminGet<{ announcements: Announcement[] }>("/api/admin/announcements");
    announcements = res.announcements ?? [];
  } catch (error) {
    return <ModuleError title="ประกาศ" error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader title="ประกาศ" description="ตั้งประกาศหน้าเว็บและข้อความสำคัญสำหรับลูกค้า" />
      <AnnouncementsManager initialAnnouncements={announcements} />
    </div>
  );
}
