import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleError, ModuleHeader, StatTile } from "@/components/adminplus/module-shell";
import { formatDateTime, formatNumber, pickNumber } from "@/lib/adminplus/format";
import { serverAdminGet } from "@/lib/adminplus/server-api";

type Notification = { severity?: string; message?: string; created_at?: string };

type PulseResponse = {
  pulse?: {
    summary?: Record<string, unknown>;
    sla?: Record<string, unknown>;
    notifications?: Notification[];
    generated_at?: string;
  };
};

type OverviewResponse = { overview?: Record<string, unknown> };

function formatMinutes(value: unknown) {
  const minutes = pickNumber(value);
  if (minutes <= 0) return "0m";
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function severityVariant(severity: unknown): "default" | "secondary" | "destructive" | "outline" {
  const key = String(severity || "info").toLowerCase();
  if (key === "critical" || key === "high") return "destructive";
  if (key === "medium") return "default";
  return "secondary";
}

export default async function DashboardPage() {
  let overview: Record<string, unknown> = {};
  let pulse: NonNullable<PulseResponse["pulse"]> = {};
  let totalUsers = 0;
  let loadError: unknown = null;

  try {
    const [overviewRes, pulseRes, usersRes] = await Promise.allSettled([
      serverAdminGet<OverviewResponse>("/api/admin/dashboard/overview?days=14&urgent_minutes=60&urgent_limit=8"),
      serverAdminGet<PulseResponse>("/api/admin/dashboard/ops-pulse?days=14&limit=14&support_sla_minutes=30&farm_sla_minutes=60"),
      serverAdminGet<{ total?: number; count?: number }>("/api/admin/users?limit=1"),
    ]);

    if (overviewRes.status === "rejected" && pulseRes.status === "rejected" && usersRes.status === "rejected") {
      throw overviewRes.reason;
    }
    if (overviewRes.status === "fulfilled") overview = overviewRes.value.overview ?? (overviewRes.value as Record<string, unknown>);
    if (pulseRes.status === "fulfilled") pulse = pulseRes.value.pulse ?? {};
    if (usersRes.status === "fulfilled") totalUsers = pickNumber(usersRes.value.total ?? usersRes.value.count);
  } catch (error) {
    loadError = error;
  }

  if (loadError) return <ModuleError title="แดชบอร์ด" error={loadError} />;

  const summary = pulse.summary ?? {};
  const sla = pulse.sla ?? {};
  const notifications = Array.isArray(pulse.notifications) ? pulse.notifications : [];

  const supportOpen = pickNumber(summary.support_open_count);
  const supportPending = pickNumber(summary.support_pending_count);
  const supportUnassigned = pickNumber(summary.support_unassigned_count);
  const supportOverSla = pickNumber(summary.support_over_sla_count);
  const farmPending = pickNumber(summary.farm_pending_count);
  const farmInProgress = pickNumber(summary.farm_in_progress_count);
  const farmUnassigned = pickNumber(summary.farm_unassigned_count);
  const farmOverSla = pickNumber(summary.farm_over_sla_count);
  const revenuePoints = pickNumber(overview.revenue_month_points ?? overview.revenue_today_points);

  const supportRisk = supportUnassigned + supportOverSla;
  const fulfillmentRisk = farmUnassigned + farmOverSla;
  const generatedAt = pulse.generated_at ?? (overview.generated_at as string | undefined);

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader title="แดชบอร์ด" description="ภาพรวมสถานะร้าน งานค้าง SLA และการแจ้งเตือนล่าสุด" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="ผู้ใช้ทั้งหมด" value={formatNumber(totalUsers)} hint="บัญชีทั้งหมดในระบบ" />
        <StatTile label="รายได้เดือนนี้" value={formatNumber(revenuePoints)} hint="พอยท์จากยอดเติมสำเร็จ" />
        <StatTile
          label="Ticket เปิดอยู่"
          value={formatNumber(supportOpen)}
          hint={supportRisk > 0 ? `${formatNumber(supportRisk)} รายการควรดูแลก่อน` : "ไม่มีสัญญาณเสี่ยงเด่น"}
        />
        <StatTile
          label="งานบริการรอดำเนินการ"
          value={formatNumber(farmPending)}
          hint={fulfillmentRisk > 0 ? `${formatNumber(fulfillmentRisk)} รายการควรเร่งตาม` : "คิวงานอยู่ในระดับปกติ"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between border-b">
              <CardTitle className="text-base">ซัพพอร์ต</CardTitle>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/support">เปิดโมดูล</Link>
              </Button>
            </CardHeader>
            <CardContent className="divide-y p-0">
              <HealthRow label="รอดำเนินการ" value={formatNumber(supportPending)} />
              <HealthRow label="ยังไม่มีผู้รับผิดชอบ" value={formatNumber(supportUnassigned)} danger={supportUnassigned > 0} />
              <HealthRow label="เกิน SLA" value={formatNumber(supportOverSla)} danger={supportOverSla > 0} />
              <HealthRow label="ตอบกลับเฉลี่ย" value={formatMinutes(sla.support_first_response_avg_minutes)} helper="เวลาตอบกลับครั้งแรก" />
              <HealthRow label="ปิดเคสเฉลี่ย" value={formatMinutes(sla.support_resolution_avg_minutes)} helper="เวลาจนแก้ไขสำเร็จ" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between border-b">
              <CardTitle className="text-base">งานบริการ</CardTitle>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/fulfillment">เปิดโมดูล</Link>
              </Button>
            </CardHeader>
            <CardContent className="divide-y p-0">
              <HealthRow label="กำลังดำเนินการ" value={formatNumber(farmInProgress)} />
              <HealthRow label="ยังไม่มีผู้รับผิดชอบ" value={formatNumber(farmUnassigned)} danger={farmUnassigned > 0} />
              <HealthRow label="เกิน SLA" value={formatNumber(farmOverSla)} danger={farmOverSla > 0} />
              <HealthRow label="มอบหมายเฉลี่ย" value={formatMinutes(sla.farm_assign_avg_minutes)} helper="เวลาจากเข้าคิวถึงมีผู้รับงาน" />
              <HealthRow label="เสร็จงานเฉลี่ย" value={formatMinutes(sla.farm_fulfill_avg_minutes)} helper="เวลาจากเริ่มงานถึงส่งมอบ" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between border-b">
            <CardTitle className="text-base">แจ้งเตือน</CardTitle>
            <span className="text-muted-foreground text-xs">{formatNumber(notifications.length)} รายการ</span>
          </CardHeader>
          <CardContent className="p-0">
            {notifications.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground text-sm">ยังไม่มีแจ้งเตือนสำคัญในช่วงนี้</p>
            ) : (
              <ul className="divide-y">
                {notifications.map((n, i) => (
                  <li key={`${n.created_at ?? "notice"}-${i}`} className="flex gap-3 px-4 py-3">
                    <Badge variant={severityVariant(n.severity)} className="mt-0.5 shrink-0">
                      {String(n.severity ?? "info").toUpperCase()}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm">{n.message ?? "-"}</p>
                      <p className="text-muted-foreground text-xs">{formatDateTime(n.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {generatedAt && <p className="text-right text-muted-foreground text-xs">อัปเดต {formatDateTime(generatedAt)}</p>}
    </div>
  );
}

function HealthRow({ label, value, helper, danger }: { label: string; value: string; helper?: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div>
        <div className="text-sm">{label}</div>
        {helper && <div className="text-muted-foreground text-xs">{helper}</div>}
      </div>
      <Badge variant={danger ? "destructive" : "secondary"} className="tabular-nums">
        {value}
      </Badge>
    </div>
  );
}
