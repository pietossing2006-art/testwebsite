"use client";

import { useCallback, useState } from "react";

import { toast } from "sonner";

import { FormDialog } from "@/components/adminplus/form-dialog";

import { CustomerFormData } from "./customer-form-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";
import { formatDateTime } from "@/lib/adminplus/format";
import { cn } from "@/lib/utils";

export type FarmRequest = {
  id: number;
  order_id: number;
  order_qty: number;
  product_name: string;
  status: string;
  assigned_booster_id: number | null;
  assigned_display_name: string | null;
  assigned_username: string | null;
  user_display_name: string | null;
  user_username: string | null;
  user_email: string;
  created_at: string;
  fulfilled_at?: string | null;
  form_data?: unknown;
  farm_form_fields?: unknown;
  uid?: string | null;
  uid_confirmed?: boolean | null;
  username?: string | null;
  password?: string | null;
  auth_key?: string | null;
};

export type FarmSummary = {
  pending: number;
  in_progress: number;
  fulfilled: number;
  cancelled: number;
  unassigned: number;
  mine: number;
  over_sla: number;
};

export type Booster = { id: number; display_name: string | null; username: string | null; email: string; role: string };

const STATUS_LABEL: Record<string, string> = {
  pending: "รอมอบหมาย",
  in_progress: "กำลังดำเนินการ",
  fulfilled: "งานเสร็จแล้ว",
  cancelled: "ยกเลิก",
};

const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  { value: "pending", label: "รอมอบหมาย" },
  { value: "in_progress", label: "กำลังดำเนินการ" },
  { value: "fulfilled", label: "เสร็จแล้ว" },
  { value: "cancelled", label: "ยกเลิก" },
];

export function FulfillmentConsole({
  initialRequests,
  initialSummary,
  boosters,
}: {
  initialRequests: FarmRequest[];
  initialSummary: FarmSummary | null;
  boosters: Booster[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [summary, setSummary] = useState(initialSummary);
  const [query, setQuery] = useState({ status: "", search: "" });
  const [selected, setSelected] = useState<FarmRequest | null>(null);
  const [logs, setLogs] = useState<{ id: number; note: string | null; action: string; created_at: string; actor_name?: string | null }[]>([]);
  const [fulfillPayload, setFulfillPayload] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: "200" });
      if (query.status) qs.set("status", query.status);
      if (query.search.trim()) qs.set("search", query.search.trim());
      const res = await adminApi.get<{ items: FarmRequest[]; summary: FarmSummary }>(`/farm-requests?${qs.toString()}`);
      setRequests(res.items ?? []);
      setSummary(res.summary ?? null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, [query]);

  const openRequest = useCallback(async (id: number, openDialog = false) => {
    if (openDialog) setDetailOpen(true);
    try {
      const res = await adminApi.get<{ request: FarmRequest; logs: typeof logs }>(`/farm-requests/${id}`);
      setSelected(res.request ?? null);
      setLogs(Array.isArray(res.logs) ? res.logs : []);
      setFulfillPayload("");
      setCancelNote("");
      setStaffNote("");
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, []);

  async function runAction(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      if (selected) await openRequest(selected.id);
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryChip label="รอมอบหมาย" value={summary.pending} />
          <SummaryChip label="กำลังทำ" value={summary.in_progress} />
          <SummaryChip label="เสร็จแล้ว" value={summary.fulfilled} />
          <SummaryChip label="ไม่มีผู้รับผิดชอบ" value={summary.unassigned} danger={summary.unassigned > 0} />
          <SummaryChip label="เกิน SLA" value={summary.over_sla} danger={summary.over_sla > 0} />
        </div>
      )}

      <>
        <Card className="gap-0 py-0">
          <CardHeader className="gap-2 border-b px-4 py-3">
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="ค้นหา order, สินค้า, อีเมล…"
                value={query.search}
                onChange={(e) => setQuery((q) => ({ ...q, search: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && reload()}
                className="h-8 w-full sm:w-56"
              />
              <NativeSelect size="sm" value={query.status} onChange={(e) => setQuery((q) => ({ ...q, status: e.target.value }))}>
                {STATUS_OPTIONS.map((o) => (
                  <NativeSelectOption key={o.value} value={o.value}>
                    {o.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button size="sm" variant="outline" onClick={reload} disabled={busy}>
                กรอง
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[32rem] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>งาน</TableHead>
                    <TableHead>ลูกค้า</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead>ผู้รับผิดชอบ</TableHead>
                    <TableHead>สร้างเมื่อ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        ไม่พบงานบริการ
                      </TableCell>
                    </TableRow>
                  )}
                  {requests.map((r) => (
                    <TableRow
                      key={r.id}
                      className={cn("cursor-pointer", selected?.id === r.id && "bg-muted")}
                      onClick={() => openRequest(r.id, true)}
                    >
                      <TableCell>
                        <div className="max-w-48 truncate font-medium text-sm">{r.product_name}</div>
                        <div className="text-muted-foreground text-xs">
                          #{r.id} · order #{r.order_id} × {r.order_qty}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-36">
                        <div className="truncate text-sm">{r.user_display_name || r.user_username || "—"}</div>
                        <div className="truncate text-muted-foreground text-xs">{r.user_email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === "cancelled" ? "outline" : r.status === "fulfilled" ? "secondary" : "default"}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{r.assigned_display_name || r.assigned_username || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatDateTime(r.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <FormDialog
          open={detailOpen && Boolean(selected)}
          onOpenChange={setDetailOpen}
          title={selected ? `#${selected.id} · ${selected.product_name}` : "รายละเอียดงาน"}
          description={selected ? `${selected.user_display_name || selected.user_email} · order #${selected.order_id}` : undefined}
          size="xl"
          footer={
            <Button size="sm" variant="outline" onClick={() => setDetailOpen(false)} disabled={busy}>
              ปิด
            </Button>
          }
        >
          {selected && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => runAction(() => adminApi.post(`/farm-requests/${selected.id}/claim`), "รับงานเรียบร้อย")}>
                    รับงาน
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => runAction(() => adminApi.post(`/farm-requests/${selected.id}/start`), "เริ่มงานเรียบร้อย")}>
                    เริ่มงาน
                  </Button>
                  <NativeSelect
                    size="sm"
                    value={selected.assigned_booster_id ? String(selected.assigned_booster_id) : ""}
                    disabled={busy}
                    onChange={(e) =>
                      e.target.value &&
                      runAction(() => adminApi.post(`/farm-requests/${selected.id}/assign`, { booster_id: Number(e.target.value) }), "มอบหมายงานเรียบร้อย")
                    }
                  >
                    <NativeSelectOption value="">มอบหมายให้…</NativeSelectOption>
                    {boosters.map((b) => (
                      <NativeSelectOption key={b.id} value={String(b.id)}>
                        {b.display_name || b.username || b.email}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>

                <CustomerFormData request={selected} />

                <Separator />

                <div>
                  <Label className="mb-1.5 block text-xs">ส่งมอบงาน (payload)</Label>
                  <Textarea rows={3} value={fulfillPayload} onChange={(e) => setFulfillPayload(e.target.value)} disabled={busy} />
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={busy || !fulfillPayload.trim()}
                    onClick={() => runAction(() => adminApi.post(`/farm-requests/${selected.id}/fulfill`, { payload: fulfillPayload }), "ส่งมอบงานเรียบร้อย")}
                  >
                    ส่งมอบงาน
                  </Button>
                </div>

                <div>
                  <Label className="mb-1.5 block text-xs">ยกเลิกงาน (เหตุผล)</Label>
                  <Input value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} disabled={busy} />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="mt-2"
                    disabled={busy}
                    onClick={() => runAction(() => adminApi.post(`/farm-requests/${selected.id}/cancel`, { note: cancelNote }), "ยกเลิกงานเรียบร้อย")}
                  >
                    ยกเลิกงาน
                  </Button>
                </div>

                <div>
                  <Label className="mb-1.5 block text-xs">โน้ตทีมงาน</Label>
                  <div className="flex gap-2">
                    <Input value={staffNote} onChange={(e) => setStaffNote(e.target.value)} disabled={busy} />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !staffNote.trim()}
                      onClick={() =>
                        runAction(async () => {
                          await adminApi.post(`/farm-requests/${selected.id}/notes`, { note: staffNote.trim() });
                          setStaffNote("");
                        }, "บันทึกโน้ตเรียบร้อย")
                      }
                    >
                      เพิ่ม
                    </Button>
                  </div>
                </div>

                {logs.length > 0 && (
                  <div>
                    <p className="mb-1 text-muted-foreground text-xs">ประวัติงาน</p>
                    <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border">
                      {logs.map((l) => (
                        <li key={l.id} className="px-3 py-2 text-xs">
                          <div className="font-medium">{l.action}</div>
                          {l.note && <div className="text-muted-foreground">{l.note}</div>}
                          <div className="text-muted-foreground">{formatDateTime(l.created_at)}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
          )}
        </FormDialog>
      </>
    </div>
  );
}

function SummaryChip({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className={cn("font-semibold text-lg tabular-nums", danger && "text-destructive")}>{value}</div>
    </div>
  );
}
