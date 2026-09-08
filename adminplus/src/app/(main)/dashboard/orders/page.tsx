import { ModuleError, ModuleHeader, StatTile } from "@/components/adminplus/module-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatNumber } from "@/lib/adminplus/format";
import { serverAdminGet } from "@/lib/adminplus/server-api";

import { groupOrders, type OrderItemRow } from "./_components/order-types";
import { OrdersTable } from "./_components/orders-table";

type OrdersResponse = {
  items: OrderItemRow[];
  total: number;
  summary: {
    pending: number;
    completed: number;
    cancelled: number;
    pending_claim: number;
    claimed: number;
    fr_pending: number;
    fr_in_progress: number;
  };
};

const PAGE_SIZE = 100;
const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  { value: "pending", label: "รอดำเนินการ" },
  { value: "completed", label: "เสร็จสิ้น" },
  { value: "cancelled", label: "ยกเลิก" },
];
const TYPE_OPTIONS = [
  { value: "", label: "ทุกประเภท" },
  { value: "digital_stock", label: "ดิจิทัล" },
  { value: "farm_form", label: "งานบริการ" },
  { value: "mystery_box", label: "กล่องสุ่ม" },
];

function buildQuery(next: Record<string, string | number>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value === "" || value === undefined) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const search = sp.search ?? "";
  const status = sp.status ?? "";
  const type = sp.type ?? "";
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1;

  const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
  if (search) qs.set("search", search);
  if (status) qs.set("status", status);
  if (type) qs.set("fulfillment_type", type);

  let data: OrdersResponse;
  try {
    data = await serverAdminGet<OrdersResponse>(`/api/admin/orders?${qs.toString()}`);
  } catch (error) {
    return <ModuleError title="ติดตาม Orders" error={error} />;
  }

  const orders = groupOrders(data.items ?? []);
  const pageCount = Math.max(1, Math.ceil((data.total ?? 0) / PAGE_SIZE));
  const summary = data.summary;

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader title="ติดตาม Orders" description="ค้นหาและตรวจสอบคำสั่งซื้อทั้งหมดจากศูนย์เดียว" />

      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="รอดำเนินการ" value={formatNumber(summary.pending)} />
          <StatTile label="เสร็จสิ้น" value={formatNumber(summary.completed)} />
          <StatTile label="รอลูกค้ารับ" value={formatNumber(summary.pending_claim)} />
          <StatTile label="งานบริการค้าง" value={formatNumber(summary.fr_pending + summary.fr_in_progress)} />
        </div>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 px-0 py-4">
          <form className="flex flex-wrap items-center gap-2 px-4" method="GET">
            <Input name="search" defaultValue={search} placeholder="ค้นหา ref, อีเมล, ชื่อสินค้า…" className="h-8 w-full sm:w-64" />
            <NativeSelect name="status" defaultValue={status} size="sm">
              {STATUS_OPTIONS.map((o) => (
                <NativeSelectOption key={o.value} value={o.value}>
                  {o.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect name="type" defaultValue={type} size="sm">
              {TYPE_OPTIONS.map((o) => (
                <NativeSelectOption key={o.value} value={o.value}>
                  {o.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="submit" size="sm">
              กรอง
            </Button>
            {(search || status || type) && (
              <Button asChild variant="ghost" size="sm">
                <a href="/dashboard/orders">ล้าง</a>
              </Button>
            )}
            <span className="ml-auto text-muted-foreground text-xs">ทั้งหมด {formatNumber(data.total)} ออเดอร์</span>
          </form>

          <div className="overflow-x-auto">
            <OrdersTable orders={orders} />
          </div>

          <div className="flex items-center justify-between px-4">
            <span className="text-muted-foreground text-xs">
              หน้า {page} / {pageCount}
            </span>
            <div className="flex gap-2">
              {page <= 1 ? (
                <Button variant="outline" size="sm" disabled>
                  ก่อนหน้า
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <a href={`/dashboard/orders${buildQuery({ search, status, type, page: page - 1 })}`}>ก่อนหน้า</a>
                </Button>
              )}
              {page >= pageCount ? (
                <Button variant="outline" size="sm" disabled>
                  ถัดไป
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <a href={`/dashboard/orders${buildQuery({ search, status, type, page: page + 1 })}`}>ถัดไป</a>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
