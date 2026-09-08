"use client";

import { useState } from "react";

import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";
import { formatDateTime } from "@/lib/adminplus/format";

export type Announcement = {
  id: number;
  title: string | null;
  text: string;
  link: string | null;
  bg: string | null;
  icon: string | null;
  enabled: boolean;
  push_to_inbox: boolean;
  sort_order: number;
  start_at: string | null;
  end_at: string | null;
  created_at?: string;
};

const ICON_OPTIONS = ["megaphone", "sparkles", "tag", "gift", "bell-ring", "info", "shield", "clock"];
const EMPTY_FORM = {
  id: null as number | null,
  title: "",
  text: "",
  link: "",
  bg: "",
  icon: "megaphone",
  enabled: true,
  push_to_inbox: false,
  start_at: "",
  end_at: "",
};
type FormState = typeof EMPTY_FORM;

function isoToLocalInput(value: string | null) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function buildPayload(form: FormState) {
  return {
    title: form.title.trim(),
    text: form.text.trim(),
    link: form.link.trim(),
    bg: form.bg.trim(),
    icon: form.icon.trim(),
    enabled: form.enabled !== false,
    push_to_inbox: form.push_to_inbox === true,
    start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
    end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
  };
}

export function AnnouncementsManager({ initialAnnouncements }: { initialAnnouncements: Announcement[] }) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const res = await adminApi.get<{ announcements: Announcement[] }>("/announcements");
      setAnnouncements(res.announcements ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function save() {
    const body = buildPayload(form);
    if (!body.text) {
      toast.error("กรุณากรอกข้อความประกาศ");
      return;
    }
    setBusy(true);
    try {
      if (form.id) await adminApi.put(`/announcements/${form.id}`, body);
      else await adminApi.post("/announcements", { ...body, sort_order: announcements.length });
      toast.success(form.id ? "แก้ไขประกาศเรียบร้อย" : "สร้างประกาศเรียบร้อย");
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
      await adminApi.delete(`/announcements/${id}`);
      toast.success("ลบประกาศเรียบร้อย");
      if (form.id === id) setForm(EMPTY_FORM);
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(ann: Announcement) {
    setBusy(true);
    try {
      await adminApi.put(`/announcements/${ann.id}`, {
        ...buildPayload({
          ...EMPTY_FORM,
          title: ann.title ?? "",
          text: ann.text,
          link: ann.link ?? "",
          bg: ann.bg ?? "",
          icon: ann.icon ?? "megaphone",
          push_to_inbox: ann.push_to_inbox,
          start_at: isoToLocalInput(ann.start_at),
          end_at: isoToLocalInput(ann.end_at),
          enabled: ann.enabled === false,
        }),
      });
      toast.success("อัปเดตสถานะเรียบร้อย");
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const ids = announcements.map((a) => a.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy(true);
    try {
      await adminApi.post("/announcements/reorder", { ordered_ids: ids });
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function edit(a: Announcement) {
    setForm({
      id: a.id,
      title: a.title ?? "",
      text: a.text ?? "",
      link: a.link ?? "",
      bg: a.bg ?? "",
      icon: a.icon ?? "megaphone",
      enabled: a.enabled !== false,
      push_to_inbox: Boolean(a.push_to_inbox),
      start_at: isoToLocalInput(a.start_at),
      end_at: isoToLocalInput(a.end_at),
    });
    setDialogOpen(true);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="flex-row items-center justify-between border-b px-4 py-3">
          <div>
            <CardTitle className="text-base">ประกาศทั้งหมด ({announcements.length})</CardTitle>
            <span className="text-muted-foreground text-xs">เปิดใช้งาน {announcements.filter((a) => a.enabled !== false).length}</span>
          </div>
          <Button size="sm" onClick={openCreate} disabled={busy}>
            <Plus /> สร้างประกาศ
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ประกาศ</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead>ช่วงเวลา</TableHead>
                <TableHead className="text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {announcements.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    ยังไม่มีประกาศ
                  </TableCell>
                </TableRow>
              )}
              {announcements.map((a, i) => (
                <TableRow key={a.id}>
                  <TableCell className="max-w-72">
                    <div className="truncate font-medium text-sm">{a.title || "(ไม่มีหัวข้อ)"}</div>
                    <div className="truncate text-muted-foreground text-xs">{a.text}</div>
                  </TableCell>
                  <TableCell>
                    <button type="button" onClick={() => toggle(a)} disabled={busy}>
                      <Badge variant={a.enabled !== false ? "secondary" : "outline"}>{a.enabled !== false ? "เปิด" : "ปิด"}</Badge>
                    </button>
                    {a.push_to_inbox && (
                      <Badge variant="outline" className="ml-1">
                        inbox
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {a.start_at || a.end_at ? `${formatDateTime(a.start_at)} → ${formatDateTime(a.end_at)}` : "ตลอดเวลา"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-xs" onClick={() => move(i, -1)} disabled={busy || i === 0}>
                        ↑
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => move(i, 1)} disabled={busy || i === announcements.length - 1}>
                        ↓
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => edit(a)} disabled={busy}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => remove(a.id)} disabled={busy}>
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

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={form.id ? `แก้ไขประกาศ #${form.id}` : "สร้างประกาศใหม่"}
        size="lg"
        footer={
          <>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              ยกเลิก
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              {form.id ? "บันทึกการแก้ไข" : "สร้างประกาศ"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <Label className="mb-1.5 block text-xs">หัวข้อ</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} disabled={busy} />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">ข้อความ *</Label>
            <Textarea rows={3} value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} disabled={busy} />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">ลิงก์</Label>
            <Input value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} disabled={busy} placeholder="/shop หรือ https://…" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">ไอคอน</Label>
            <NativeSelect
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              disabled={busy}
              className="w-full"
            >
              {ICON_OPTIONS.map((icon) => (
                <NativeSelectOption key={icon} value={icon}>
                  {icon}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">พื้นหลัง (CSS background)</Label>
            <Input value={form.bg} onChange={(e) => setForm((f) => ({ ...f, bg: e.target.value }))} disabled={busy} placeholder="linear-gradient(...)" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1.5 block text-xs">เริ่มแสดง</Label>
              <Input type="datetime-local" value={form.start_at} onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))} disabled={busy} />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">สิ้นสุด</Label>
              <Input type="datetime-local" value={form.end_at} onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))} disabled={busy} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.enabled} onCheckedChange={(c) => setForm((f) => ({ ...f, enabled: Boolean(c) }))} />
            เปิดใช้งาน
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.push_to_inbox} onCheckedChange={(c) => setForm((f) => ({ ...f, push_to_inbox: Boolean(c) }))} />
            ส่งเข้า inbox ผู้ใช้ด้วย
          </label>
        </div>
      </FormDialog>
    </>
  );
}
