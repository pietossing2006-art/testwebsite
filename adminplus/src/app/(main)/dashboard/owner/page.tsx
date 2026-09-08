import { ModuleError, ModuleHeader, StatTile } from "@/components/adminplus/module-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatNumber } from "@/lib/adminplus/format";
import { serverAdminGet } from "@/lib/adminplus/server-api";

type OwnerStats = {
  stats: {
    total_users: number;
    by_role: Record<string, number>;
    total_balance: number;
    total_orders: number;
    total_revenue: number;
  };
  top_admins: {
    id: number;
    username: string | null;
    email: string;
    role: string;
    audit_count: number;
    last_action_at: string | null;
  }[];
};

type QueueHealth = { queues?: Record<string, unknown>; [key: string]: unknown };

export default async function OwnerPage() {
  let data: OwnerStats;
  try {
    data = await serverAdminGet<OwnerStats>("/api/admin/owner/stats");
  } catch (error) {
    return <ModuleError title="Owner Panel" error={error} />;
  }

  let queueHealth: QueueHealth | null = null;
  try {
    queueHealth = await serverAdminGet<QueueHealth>("/api/admin/queue-health");
  } catch {
    queueHealth = null;
  }

  const byRole = Object.entries(data.stats.by_role ?? {});

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader title="Owner Panel" description="เครื่องมือระดับเจ้าของระบบ ภาพรวมเชิงลึกและกิจกรรมทีมงาน" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="ผู้ใช้ทั้งหมด" value={formatNumber(data.stats.total_users)} />
        <StatTile label="พอยท์คงเหลือรวม" value={formatNumber(data.stats.total_balance)} />
        <StatTile label="ออเดอร์ทั้งหมด" value={formatNumber(data.stats.total_orders)} />
        <StatTile label="รายได้รวม (อนุมัติแล้ว)" value={`${formatNumber(data.stats.total_revenue)} ฿`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle className="text-base">ผู้ใช้แยกตามสิทธิ์</CardTitle>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {byRole.length === 0 && <p className="py-8 text-center text-muted-foreground text-sm">ไม่มีข้อมูล</p>}
            {byRole.map(([role, count]) => (
              <div key={role} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm capitalize">{role}</span>
                <Badge variant="secondary" className="tabular-nums">
                  {formatNumber(count)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle className="text-base">กิจกรรมทีมงานล่าสุด</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ทีมงาน</TableHead>
                  <TableHead>สิทธิ์</TableHead>
                  <TableHead className="text-right">จำนวน action</TableHead>
                  <TableHead>ล่าสุด</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.top_admins ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      ไม่มีข้อมูล
                    </TableCell>
                  </TableRow>
                )}
                {(data.top_admins ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="text-sm">{a.username || a.email}</div>
                      <div className="text-muted-foreground text-xs">{a.email}</div>
                    </TableCell>
                    <TableCell className="capitalize">{a.role}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(a.audit_count)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{formatDateTime(a.last_action_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {queueHealth && (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle className="text-base">Queue health</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(queueHealth, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
