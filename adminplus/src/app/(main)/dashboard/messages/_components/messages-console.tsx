"use client";

import { useEffect, useState } from "react";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";
import { formatDateTime } from "@/lib/adminplus/format";
import { cn } from "@/lib/utils";

export type SiteMessage = {
  id: number;
  target_type: string;
  target_user_id: number | null;
  title: string;
  body: string;
  created_at: string;
  sender_display_name?: string | null;
  target_display_name?: string | null;
  target_email?: string | null;
};

type PickerUser = { id: number; email: string; username: string | null; display_name: string | null };

const PRESETS = [
  { id: "welcome", title: "ยินดีต้อนรับ", body: "ขอบคุณที่ใช้บริการร้านของเรา หากมีข้อสงสัยติดต่อทีมงานได้ตลอดครับ" },
  { id: "topup", title: "ยืนยันการเติมเงิน", body: "ระบบได้เพิ่มพอยท์เข้าบัญชีของคุณเรียบร้อยแล้ว ขอบคุณที่ใช้บริการ" },
  { id: "issue", title: "แจ้งความคืบหน้า", body: "ทีมงานกำลังตรวจสอบรายการของคุณอยู่ครับ จะรีบแจ้งผลให้ทราบโดยเร็วที่สุด" },
];

export function MessagesConsole({ initialMessages }: { initialMessages: SiteMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [broadcast, setBroadcast] = useState({ title: "", body: "" });
  const [direct, setDirect] = useState({ title: "", body: "" });
  const [selectedUser, setSelectedUser] = useState<PickerUser | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<PickerUser[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = userSearch.trim();
    if (!q) {
      setUserResults([]);
      return;
    }
    const timer = setTimeout(() => {
      adminApi
        .get<{ users: PickerUser[] }>(`/users?limit=20&search=${encodeURIComponent(q)}`)
        .then((res) => setUserResults(res.users ?? []))
        .catch(() => setUserResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch]);

  async function reload() {
    try {
      const res = await adminApi.get<{ messages: SiteMessage[] }>("/site-messages?limit=100&offset=0");
      setMessages(res.messages ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function sendBroadcast() {
    if (!broadcast.title.trim() || !broadcast.body.trim()) {
      toast.error("กรุณากรอกหัวข้อและข้อความประกาศ");
      return;
    }
    setBusy(true);
    try {
      await adminApi.post("/site-messages", { target_type: "global", title: broadcast.title.trim(), body: broadcast.body.trim() });
      toast.success("ส่งประกาศถึงสมาชิกทุกคนเรียบร้อย");
      setBroadcast({ title: "", body: "" });
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendDirect() {
    if (!selectedUser) {
      toast.error("กรุณาเลือกผู้ใช้ที่ต้องการส่งข้อความ");
      return;
    }
    if (!direct.title.trim() || !direct.body.trim()) {
      toast.error("กรุณากรอกหัวข้อและข้อความ");
      return;
    }
    setBusy(true);
    try {
      const payload = { title: direct.title.trim(), body: direct.body.trim() };
      try {
        await adminApi.post(`/direct-chat/${selectedUser.id}/messages`, payload);
      } catch {
        // Older deployments only expose the site-messages endpoint.
        await adminApi.post("/site-messages", { target_type: "individual", target_user_id: selectedUser.id, ...payload });
      }
      toast.success(`ส่งข้อความถึง ${selectedUser.display_name || selectedUser.username || selectedUser.email} เรียบร้อย`);
      setDirect({ title: "", body: "" });
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
      await adminApi.delete(`/site-messages/${id}`);
      toast.success("ลบข้อความเรียบร้อย");
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,400px)_1fr]">
      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-4 py-3">
          <CardTitle className="text-base">ส่งข้อความ</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <Tabs defaultValue="direct">
            <TabsList className="w-full">
              <TabsTrigger value="direct">ส่งรายบุคคล</TabsTrigger>
              <TabsTrigger value="broadcast">ประกาศทุกคน</TabsTrigger>
            </TabsList>

            <TabsContent value="direct" className="flex flex-col gap-3 pt-4">
              <div>
                <Label className="mb-1.5 block text-xs">ค้นหาผู้ใช้</Label>
                <Input
                  placeholder="อีเมล, username, ชื่อ…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  disabled={busy}
                />
                {userResults.length > 0 && (
                  <ul className="mt-1 max-h-40 divide-y overflow-y-auto rounded-lg border">
                    {userResults.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className={cn("w-full px-3 py-2 text-left text-sm hover:bg-muted/50", selectedUser?.id === u.id && "bg-muted")}
                          onClick={() => {
                            setSelectedUser(u);
                            setUserSearch("");
                            setUserResults([]);
                          }}
                        >
                          <div className="truncate">{u.display_name || u.username || u.email}</div>
                          <div className="truncate text-muted-foreground text-xs">{u.email}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selectedUser && (
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{selectedUser.display_name || selectedUser.username || selectedUser.email}</span>
                  <Button variant="ghost" size="xs" onClick={() => setSelectedUser(null)}>
                    เปลี่ยน
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <Button key={p.id} variant="outline" size="xs" onClick={() => setDirect({ title: p.title, body: p.body })}>
                    {p.title}
                  </Button>
                ))}
              </div>

              <div>
                <Label className="mb-1.5 block text-xs">หัวข้อ</Label>
                <Input value={direct.title} onChange={(e) => setDirect((d) => ({ ...d, title: e.target.value }))} disabled={busy} />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">ข้อความ</Label>
                <Textarea rows={4} value={direct.body} onChange={(e) => setDirect((d) => ({ ...d, body: e.target.value }))} disabled={busy} />
              </div>
              <Button size="sm" onClick={sendDirect} disabled={busy || !selectedUser}>
                ส่งข้อความ
              </Button>
            </TabsContent>

            <TabsContent value="broadcast" className="flex flex-col gap-3 pt-4">
              <div>
                <Label className="mb-1.5 block text-xs">หัวข้อ</Label>
                <Input value={broadcast.title} onChange={(e) => setBroadcast((b) => ({ ...b, title: e.target.value }))} disabled={busy} />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">ข้อความ</Label>
                <Textarea rows={4} value={broadcast.body} onChange={(e) => setBroadcast((b) => ({ ...b, body: e.target.value }))} disabled={busy} />
              </div>
              <Button size="sm" onClick={sendBroadcast} disabled={busy}>
                ส่งถึงสมาชิกทุกคน
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-4 py-3">
          <CardTitle className="text-base">ข้อความที่ส่งแล้ว ({messages.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[32rem] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ข้อความ</TableHead>
                  <TableHead>ถึง</TableHead>
                  <TableHead>ส่งเมื่อ</TableHead>
                  <TableHead className="text-right">ลบ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      ยังไม่มีข้อความ
                    </TableCell>
                  </TableRow>
                )}
                {messages.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="max-w-72">
                      <div className="truncate font-medium text-sm">{m.title}</div>
                      <div className="truncate text-muted-foreground text-xs">{m.body}</div>
                    </TableCell>
                    <TableCell>
                      {m.target_type === "global" ? (
                        <Badge variant="secondary">ทุกคน</Badge>
                      ) : (
                        <span className="text-xs">{m.target_display_name || m.target_email || `#${m.target_user_id}`}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{formatDateTime(m.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-xs" onClick={() => remove(m.id)} disabled={busy}>
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
