"use client";

import { useCallback, useEffect, useState } from "react";

import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";
import { formatDateTime } from "@/lib/adminplus/format";
import { cn, getInitials } from "@/lib/utils";

export type SupportTicket = {
  id: number;
  subject: string;
  status: string;
  priority: string | null;
  category: string | null;
  order_ref: string | null;
  user_email: string;
  user_display_name: string | null;
  user_avatar_url: string | null;
  assigned_to: number | null;
  assigned_display_name: string | null;
  last_message_preview: string | null;
  last_sender_at: string | null;
  created_at: string;
};

export type SupportMessage = {
  id: number;
  message: string;
  is_internal: boolean;
  sender_role: string | null;
  sender_display_name: string | null;
  sender_email: string | null;
  sender_avatar_url: string | null;
  attachments: unknown;
  created_at: string;
};

export type SupportAgent = { id: number; display_name: string | null; username: string | null; email: string };

export type SupportSummary = {
  open: number;
  pending: number;
  closed: number;
  unassigned: number;
  mine: number;
  needs_reply: number;
  over_sla: number;
};

const STATUS_LABEL: Record<string, string> = { open: "เปิด", pending: "รอดำเนินการ", closed: "ปิดแล้ว" };
const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  { value: "open", label: "เปิด" },
  { value: "pending", label: "รอดำเนินการ" },
  { value: "closed", label: "ปิดแล้ว" },
];
const SCOPE_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "mine", label: "ของฉัน" },
  { value: "unassigned", label: "ยังไม่มีผู้รับผิดชอบ" },
];

export function SupportConsole({
  initialTickets,
  initialSummary,
  agents,
}: {
  initialTickets: SupportTicket[];
  initialSummary: SupportSummary | null;
  agents: SupportAgent[];
}) {
  const [tickets, setTickets] = useState(initialTickets);
  const [summary, setSummary] = useState(initialSummary);
  const [query, setQuery] = useState({ status: "", scope: "all", search: "" });
  const [selectedId, setSelectedId] = useState<number | null>(initialTickets[0]?.id ?? null);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listLoading, setListLoading] = useState(false);

  const reloadList = useCallback(async () => {
    setListLoading(true);
    try {
      const qs = new URLSearchParams({ limit: "120" });
      if (query.status) qs.set("status", query.status);
      if (query.scope && query.scope !== "all") qs.set("scope", query.scope);
      if (query.scope === "unassigned") qs.set("assigned_to", "unassigned");
      if (query.scope === "mine") qs.set("assigned_to", "me");
      if (query.search.trim()) qs.set("search", query.search.trim());
      const res = await adminApi.get<{ tickets: SupportTicket[]; summary: SupportSummary }>(`/support-tickets?${qs.toString()}`);
      setTickets(res.tickets ?? []);
      setSummary(res.summary ?? null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setListLoading(false);
    }
  }, [query]);

  const openTicket = useCallback(async (ticketId: number) => {
    setSelectedId(ticketId);
    try {
      const res = await adminApi.get<{ ticket: SupportTicket; messages: SupportMessage[] }>(`/support-tickets/${ticketId}`);
      setTicket(res.ticket ?? null);
      setMessages(Array.isArray(res.messages) ? res.messages : []);
      setReply("");
      setIsInternal(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (selectedId !== null) void openTicket(selectedId);
    // Only on first mount / when the selected id changes from the list.
  }, [selectedId, openTicket]);

  async function runAction(fn: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(successMessage);
      if (selectedId) await openTicket(selectedId);
      await reloadList();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(andClose: boolean) {
    if (!selectedId || !reply.trim()) return;
    const text = reply.trim();
    await runAction(async () => {
      await adminApi.post(`/support-tickets/${selectedId}/reply`, { message: text, attachments: [], is_internal: isInternal });
      if (andClose && !isInternal) {
        await adminApi.post(`/support-tickets/${selectedId}/status`, { status: "closed" });
      }
      setReply("");
      setIsInternal(false);
    }, andClose ? "ส่งข้อความและปิดเคสเรียบร้อย" : "ส่งข้อความเรียบร้อย");
  }

  return (
    <div className="flex flex-col gap-4">
      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryChip label="เปิด" value={summary.open} />
          <SummaryChip label="รอดำเนินการ" value={summary.pending} />
          <SummaryChip label="ยังไม่มีผู้รับผิดชอบ" value={summary.unassigned} danger={summary.unassigned > 0} />
          <SummaryChip label="รอตอบกลับ" value={summary.needs_reply} danger={summary.needs_reply > 0} />
          <SummaryChip label="เกิน SLA" value={summary.over_sla} danger={summary.over_sla > 0} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        <Card className="gap-0 py-0">
          <CardHeader className="gap-2 border-b px-3 py-3">
            <div className="flex gap-2">
              <Input
                placeholder="ค้นหาหัวข้อ, อีเมล…"
                value={query.search}
                onChange={(e) => setQuery((q) => ({ ...q, search: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && reloadList()}
                className="h-8"
              />
              <Button size="sm" variant="outline" onClick={reloadList} disabled={listLoading}>
                ค้นหา
              </Button>
            </div>
            <div className="flex gap-2">
              <NativeSelect
                size="sm"
                value={query.status}
                onChange={(e) => setQuery((q) => ({ ...q, status: e.target.value }))}
                className="flex-1"
              >
                {STATUS_OPTIONS.map((o) => (
                  <NativeSelectOption key={o.value} value={o.value}>
                    {o.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                size="sm"
                value={query.scope}
                onChange={(e) => setQuery((q) => ({ ...q, scope: e.target.value }))}
                className="flex-1"
              >
                {SCOPE_OPTIONS.map((o) => (
                  <NativeSelectOption key={o.value} value={o.value}>
                    {o.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </CardHeader>
          <CardContent className="max-h-[32rem] overflow-y-auto p-0">
            {tickets.length === 0 && <p className="py-10 text-center text-muted-foreground text-sm">ไม่พบทิกเก็ต</p>}
            <ul className="divide-y">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      "flex w-full flex-col gap-1 px-3 py-2.5 text-left hover:bg-muted/50",
                      selectedId === t.id && "bg-muted",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium text-sm">{t.subject}</span>
                      <Badge variant={t.status === "closed" ? "outline" : t.status === "pending" ? "default" : "secondary"}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </Badge>
                    </div>
                    <span className="truncate text-muted-foreground text-xs">{t.user_display_name || t.user_email}</span>
                    <span className="truncate text-muted-foreground text-xs">
                      {t.assigned_display_name ? `ผู้รับผิดชอบ: ${t.assigned_display_name}` : "ยังไม่มีผู้รับผิดชอบ"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          {!ticket ? (
            <CardContent className="py-20 text-center text-muted-foreground text-sm">เลือกทิกเก็ตทางซ้ายเพื่อดูรายละเอียด</CardContent>
          ) : (
            <>
              <CardHeader className="gap-2 border-b px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{ticket.subject}</CardTitle>
                  <Badge variant="secondary">{STATUS_LABEL[ticket.status] ?? ticket.status}</Badge>
                  {ticket.order_ref && <Badge variant="outline">{ticket.order_ref}</Badge>}
                </div>
                <p className="text-muted-foreground text-xs">
                  {ticket.user_display_name || ticket.user_email} · เปิดเมื่อ {formatDateTime(ticket.created_at)}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => runAction(() => adminApi.post(`/support-tickets/${ticket.id}/claim`), "รับเคสเรียบร้อย")}>
                    รับเคส
                  </Button>
                  <NativeSelect
                    size="sm"
                    value={ticket.assigned_to == null ? "" : String(ticket.assigned_to)}
                    disabled={busy}
                    onChange={(e) =>
                      runAction(
                        () => adminApi.post(`/support-tickets/${ticket.id}/assign`, { assigned_to: e.target.value ? Number(e.target.value) : null }),
                        "มอบหมายงานเรียบร้อย",
                      )
                    }
                  >
                    <NativeSelectOption value="">ยังไม่มอบหมาย</NativeSelectOption>
                    {agents.map((a) => (
                      <NativeSelectOption key={a.id} value={String(a.id)}>
                        {a.display_name || a.username || a.email}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    size="sm"
                    value={ticket.status}
                    disabled={busy}
                    onChange={(e) => runAction(() => adminApi.post(`/support-tickets/${ticket.id}/status`, { status: e.target.value }), "อัปเดตสถานะเรียบร้อย")}
                  >
                    <NativeSelectOption value="open">เปิด</NativeSelectOption>
                    <NativeSelectOption value="pending">รอดำเนินการ</NativeSelectOption>
                    <NativeSelectOption value="closed">ปิดแล้ว</NativeSelectOption>
                  </NativeSelect>
                </div>
              </CardHeader>

              <CardContent className="flex max-h-[26rem] flex-col gap-3 overflow-y-auto p-4">
                {messages.length === 0 && <p className="py-8 text-center text-muted-foreground text-sm">ยังไม่มีข้อความ</p>}
                {messages.map((m) => {
                  const isStaff = String(m.sender_role || "").toLowerCase() !== "user";
                  return (
                    <div key={m.id} className={cn("flex gap-2", isStaff && "flex-row-reverse")}>
                      <Avatar className="size-7 shrink-0 rounded-lg">
                        <AvatarImage src={m.sender_avatar_url ?? undefined} alt={m.sender_display_name ?? ""} />
                        <AvatarFallback>{getInitials(m.sender_display_name || m.sender_email || "?")}</AvatarFallback>
                      </Avatar>
                      <div
                        className={cn(
                          "max-w-[75%] rounded-lg border px-3 py-2 text-sm",
                          isStaff && "bg-muted",
                          m.is_internal && "border-dashed border-amber-500/60",
                        )}
                      >
                        {m.is_internal && <div className="mb-1 font-medium text-amber-600 text-xs">โน้ตภายใน</div>}
                        <p className="whitespace-pre-wrap break-words">{m.message}</p>
                        <p className="mt-1 text-muted-foreground text-xs">
                          {m.sender_display_name || m.sender_email} · {formatDateTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>

              <div className="flex flex-col gap-2 border-t p-3">
                <Textarea
                  rows={3}
                  placeholder="พิมพ์ข้อความตอบกลับ…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  disabled={busy}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={isInternal} onCheckedChange={(c) => setIsInternal(Boolean(c))} />
                    โน้ตภายใน (ลูกค้าไม่เห็น)
                  </label>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => sendReply(true)} disabled={busy || !reply.trim() || isInternal}>
                      ส่งและปิดเคส
                    </Button>
                    <Button size="sm" onClick={() => sendReply(false)} disabled={busy || !reply.trim()}>
                      ส่งข้อความ
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
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
