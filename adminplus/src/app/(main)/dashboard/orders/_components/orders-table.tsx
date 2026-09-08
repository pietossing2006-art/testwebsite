"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormDialog } from "@/components/adminplus/form-dialog";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";
import { formatDateTime, formatNumber } from "@/lib/adminplus/format";

import {
  DELIVERY_STATUS_LABEL,
  FARM_STATUS_LABEL,
  FULFILLMENT_TYPE_LABEL,
  getOptionLabel,
  ORDER_STATUS_LABEL,
  STAGE_META,
  type GroupedOrder,
} from "./order-types";

type OrderDetail = {
  order: {
    id: number;
    ref: string | null;
    status: string;
    total_points: number;
    created_at: string;
    user_email: string;
    user_display_name: string | null;
    product_name: string;
    product_option: string | null;
    category_name: string | null;
    fulfillment_type: string;
    qty: number;
    unit_price_points: number;
  } | null;
  deliveries: {
    id: number;
    status: string;
    claimed_at: string | null;
    farm_status: string | null;
    assigned_staff_name: string | null;
    payload?: string | null;
    created_at?: string;
  }[];
};

export function OrdersTable({ orders }: { orders: GroupedOrder[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (openId === null) return;
    setLoading(true);
    setDetail(null);
    adminApi
      .get<OrderDetail>(`/orders/${openId}`)
      .then(setDetail)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [openId]);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ออเดอร์</TableHead>
            <TableHead>ลูกค้า</TableHead>
            <TableHead>สินค้า</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead>ขั้นตอน</TableHead>
            <TableHead className="text-right">ยอดพอยท์</TableHead>
            <TableHead>สั่งเมื่อ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                ไม่พบออเดอร์
              </TableCell>
            </TableRow>
          )}
          {orders.map((order) => {
            const stage = STAGE_META[order.stage] ?? STAGE_META.pending;
            return (
              <TableRow key={order.id} className="cursor-pointer" onClick={() => setOpenId(order.id)}>
                <TableCell>
                  <div className="font-medium text-sm">{order.ref || `#${order.id}`}</div>
                  <div className="text-muted-foreground text-xs">{ORDER_STATUS_LABEL[order.status] ?? order.status}</div>
                </TableCell>
                <TableCell>
                  <div className="max-w-40 truncate text-sm">{order.user_display_name || "—"}</div>
                  <div className="max-w-40 truncate text-muted-foreground text-xs">{order.user_email}</div>
                </TableCell>
                <TableCell className="max-w-56">
                  <div className="truncate text-sm">{order.productNames.join(", ")}</div>
                  <div className="text-muted-foreground text-xs">{order.itemCount} ชิ้น</div>
                </TableCell>
                <TableCell className="text-xs">{FULFILLMENT_TYPE_LABEL[order.fulfillment_type] ?? order.fulfillment_type}</TableCell>
                <TableCell>
                  <Badge variant={stage.danger ? "destructive" : "secondary"}>{stage.label}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(order.total_points)}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{formatDateTime(order.created_at)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <FormDialog
        open={openId !== null}
        onOpenChange={(open) => !open && setOpenId(null)}
        size="xl"
        title={detail?.order ? detail.order.ref || `#${detail.order.id}` : loading ? "กำลังโหลด…" : "รายละเอียดออเดอร์"}
        description={detail?.order ? `${detail.order.user_display_name || detail.order.user_email}` : "ข้อมูลจาก /api/admin/orders/:id"}
      >
        <>
          {detail?.order && (
            <div className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Info label="สถานะ" value={ORDER_STATUS_LABEL[detail.order.status] ?? detail.order.status} />
                <Info label="ยอดรวม" value={`${formatNumber(detail.order.total_points)} พอยท์`} />
                <Info label="สินค้า" value={detail.order.product_name} />
                <Info label="ตัวเลือก" value={getOptionLabel(detail.order.product_option) || "ตัวเลือกเริ่มต้น"} />
                <Info label="หมวดหมู่" value={detail.order.category_name ?? "—"} />
                <Info label="ประเภท" value={FULFILLMENT_TYPE_LABEL[detail.order.fulfillment_type] ?? detail.order.fulfillment_type} />
                <Info label="จำนวน" value={`${detail.order.qty} × ${formatNumber(detail.order.unit_price_points)}`} />
                <Info label="สั่งเมื่อ" value={formatDateTime(detail.order.created_at)} />
                <Info label="อีเมลลูกค้า" value={detail.order.user_email} />
              </dl>

              <Separator />

              <div>
                <p className="mb-2 font-medium text-sm">การจัดส่ง ({detail.deliveries.length})</p>
                <div className="flex flex-col gap-2">
                  {detail.deliveries.length === 0 && <p className="text-muted-foreground text-sm">ยังไม่มีรายการจัดส่ง</p>}
                  {detail.deliveries.map((d) => (
                    <div key={d.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{DELIVERY_STATUS_LABEL[d.status] ?? d.status}</Badge>
                        {d.farm_status && <Badge variant="outline">{FARM_STATUS_LABEL[d.farm_status] ?? d.farm_status}</Badge>}
                        {d.assigned_staff_name && <span className="text-muted-foreground text-xs">ผู้รับผิดชอบ: {d.assigned_staff_name}</span>}
                      </div>
                      {d.claimed_at && <p className="mt-1 text-muted-foreground text-xs">รับเมื่อ {formatDateTime(d.claimed_at)}</p>}
                      {d.payload && <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">{d.payload}</pre>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      </FormDialog>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}
