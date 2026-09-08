import { ModuleError, ModuleHeader } from "@/components/adminplus/module-shell";
import { serverAdminGet } from "@/lib/adminplus/server-api";
import { getCurrentAdminUser } from "@/server/auth-actions";

import { TimesheetConsole, type ClockSession } from "./_components/timesheet-console";

export default async function TimesheetPage() {
  const viewer = await getCurrentAdminUser();
  const isAdmin = viewer?.role === "admin" || viewer?.role === "owner";

  let status: { clocked_in?: boolean; clock_in?: string | null; auto_clock_out_at?: string | null } = {};
  let mySessions: ClockSession[] = [];
  let allSessions: ClockSession[] | null = null;

  try {
    const [statusRes, sessionsRes] = await Promise.all([
      serverAdminGet<typeof status>("/api/staff/clock-status"),
      serverAdminGet<{ items: ClockSession[] }>("/api/staff/clock-sessions?limit=100"),
    ]);
    status = statusRes;
    mySessions = sessionsRes.items ?? [];
  } catch (error) {
    return <ModuleError title="ลงเวลางาน" error={error} />;
  }

  if (isAdmin) {
    try {
      const res = await serverAdminGet<{ items: ClockSession[] }>("/api/admin/clock-sessions?limit=200");
      allSessions = res.items ?? [];
    } catch {
      allSessions = null;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader title="ลงเวลางาน" description="บันทึกเวลาเข้างาน ออกงาน และตรวจรอบการทำงานของทีม" />
      <TimesheetConsole
        clockedIn={Boolean(status.clocked_in)}
        clockIn={status.clock_in ?? null}
        autoClockOutAt={status.auto_clock_out_at ?? null}
        mySessions={mySessions}
        allSessions={allSessions}
      />
    </div>
  );
}
