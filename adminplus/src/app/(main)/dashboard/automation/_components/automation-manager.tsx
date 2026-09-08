"use client";

import { useState } from "react";

import { Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FormDialog } from "@/components/adminplus/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";
import { formatDateTime } from "@/lib/adminplus/format";

export type AutomationRule = {
  id: number;
  name: string;
  trigger_type: string;
  trigger_config: { minutes?: number } | null;
  action_type: string;
  action_config: { severity?: string } | null;
  is_active: boolean;
  created_at?: string;
};

export type AutomationEvent = {
  id: number;
  rule_id: number | null;
  rule_name?: string | null;
  severity: string | null;
  message: string | null;
  created_at: string;
};

const TRIGGER_LABELS: Record<string, string> = {
  support_unassigned_overdue: "Support ค้างไม่มีผู้รับ",
  farm_unassigned_overdue: "Farm ค้างไม่มีผู้รับ",
  support_no_reply_overdue: "Support ค้างไม่ตอบกลับ",
  farm_in_progress_overdue: "Farm ค้างอยู่ระหว่างดำเนินการ",
};

const SEVERITIES = ["low", "medium", "high", "critical"];

const EMPTY_FORM = {
  id: null as number | null,
  name: "",
  trigger_type: "support_unassigned_overdue",
  trigger_minutes: 30,
  action_severity: "high",
  is_active: true,
};

export function AutomationManager({
  initialRules,
  initialEvents,
}: {
  initialRules: AutomationRule[];
  initialEvents: AutomationEvent[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [events, setEvents] = useState(initialEvents);
  const [form, setForm] = useState(EMPTY_FORM);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const [rulesRes, eventsRes] = await Promise.all([
        adminApi.get<{ rules: AutomationRule[] }>("/workflow-automation/rules?limit=100&offset=0"),
        adminApi.get<{ events: AutomationEvent[] }>("/workflow-automation/events?limit=100"),
      ]);
      setRules(rulesRes.rules ?? []);
      setEvents(eventsRes.events ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function save() {
    const name = form.name.trim();
    const minutes = Number(form.trigger_minutes);
    if (!name) {
      toast.error("ชื่อกฎห้ามว่าง");
      return;
    }
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 43200) {
      toast.error("Trigger minutes ต้องอยู่ระหว่าง 1-43200");
      return;
    }
    const body = {
      name,
      trigger_type: form.trigger_type,
      trigger_config: { minutes: Math.trunc(minutes) },
      action_type: "create_notification",
      action_config: { severity: form.action_severity },
      is_active: Boolean(form.is_active),
    };
    setBusy(true);
    try {
      if (form.id) await adminApi.put(`/workflow-automation/rules/${form.id}`, body);
      else await adminApi.post("/workflow-automation/rules", body);
      toast.success(form.id ? "แก้ไขกฎเรียบร้อย" : "สร้างกฎเรียบร้อย");
      setForm(EMPTY_FORM);
      setDialogOpen(false);
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await adminApi.delete(`/workflow-automation/rules/${id}`);
      toast.success("ลบกฎเรียบร้อย");
      if (form.id === id) setForm(EMPTY_FORM);
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    try {
      await adminApi.post("/workflow-automation/run");
      toast.success("สั่งรัน automation เรียบร้อย");
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function edit(r: AutomationRule) {
    setForm({
      id: r.id,
      name: r.name ?? "",
      trigger_type: r.trigger_type || "support_unassigned_overdue",
      trigger_minutes: Math.max(1, Number(r.trigger_config?.minutes ?? 30)),
      action_severity: String(r.action_config?.severity ?? "high"),
      is_active: r.is_active !== false,
    });
    setDialogOpen(true);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <Card className="gap-0 py-0">
          <CardHeader className="flex-row items-center justify-between border-b px-4 py-3">
            <CardTitle className="text-base">
              กฎอัตโนมัติ ({rules.length}) · เปิดใช้งาน {rules.filter((r) => r.is_active !== false).length}
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={runNow} disabled={busy}>
                <Play /> รันตอนนี้
              </Button>
              <Button size="sm" onClick={openCreate} disabled={busy}>
                <Plus /> สร้างกฎ
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อกฎ</TableHead>
                  <TableHead>เงื่อนไข</TableHead>
                  <TableHead>ความรุนแรง</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      ยังไม่มีกฎอัตโนมัติ
                    </TableCell>
                  </TableRow>
                )}
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium text-sm">{r.name}</TableCell>
                    <TableCell className="text-xs">
                      {TRIGGER_LABELS[r.trigger_type] ?? r.trigger_type} · เกิน {r.trigger_config?.minutes ?? "-"} นาที
                    </TableCell>
                    <TableCell className="text-xs capitalize">{r.action_config?.severity ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={r.is_active !== false ? "secondary" : "outline"}>{r.is_active !== false ? "เปิด" : "ปิด"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-xs" onClick={() => edit(r)} disabled={busy}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-xs" onClick={() => remove(r.id)} disabled={busy}>
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle className="text-base">เหตุการณ์ล่าสุด ({events.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="max-h-80 divide-y overflow-y-auto">
              {events.length === 0 && <li className="py-8 text-center text-muted-foreground text-sm">ยังไม่มีเหตุการณ์</li>}
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 px-4 py-2.5">
                  <Badge variant={e.severity === "high" || e.severity === "critical" ? "destructive" : "secondary"} className="mt-0.5 shrink-0">
                    {e.severity ?? "info"}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-sm">{e.message ?? "-"}</p>
                    <p className="text-muted-foreground text-xs">
                      {e.rule_name ? `${e.rule_name} · ` : ""}
                      {formatDateTime(e.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={form.id ? `แก้ไขกฎ #${form.id}` : "สร้างกฎใหม่"}
        footer={
          <>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              ยกเลิก
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              {form.id ? "บันทึกการแก้ไข" : "สร้างกฎ"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <Label className="mb-1.5 block text-xs">ชื่อกฎ</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={busy} />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">เงื่อนไข (trigger)</Label>
            <NativeSelect
              value={form.trigger_type}
              onChange={(e) => setForm((f) => ({ ...f, trigger_type: e.target.value }))}
              disabled={busy}
              className="w-full"
            >
              {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">เกินกี่นาทีจึงแจ้งเตือน (1-43200)</Label>
            <Input
              type="number"
              value={form.trigger_minutes}
              onChange={(e) => setForm((f) => ({ ...f, trigger_minutes: Number(e.target.value) }))}
              disabled={busy}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">ความรุนแรงของการแจ้งเตือน</Label>
            <NativeSelect
              value={form.action_severity}
              onChange={(e) => setForm((f) => ({ ...f, action_severity: e.target.value }))}
              disabled={busy}
              className="w-full"
            >
              {SEVERITIES.map((s) => (
                <NativeSelectOption key={s} value={s}>
                  {s}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.is_active} onCheckedChange={(c) => setForm((f) => ({ ...f, is_active: Boolean(c) }))} />
            เปิดใช้งานกฎนี้
          </label>
        </div>
      </FormDialog>
    </>
  );
}
