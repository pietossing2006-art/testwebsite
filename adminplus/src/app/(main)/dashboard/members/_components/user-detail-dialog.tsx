"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormDialog } from "@/components/adminplus/form-dialog";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";
import { formatDateTime, formatNumber } from "@/lib/adminplus/format";
import { getInitials } from "@/lib/utils";

import { canAdjustPoints, canEditUsers, ROLE_LABEL, USER_ROLE_OPTIONS, type ManagementDetail, type UserOrderRow } from "./types";

const ROLE_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "default",
  finance: "secondary",
  support: "secondary",
  booster: "outline",
  user: "outline",
};

const QUICK_POINT_AMOUNTS = ["50", "100", "300", "500", "1000", "5000"];
const QUICK_POINT_REASONS = ["เติมเงินระบบ (โอนเงิน)", "กิจกรรม / แจกรางวัล", "ชดเชยระบบ", "แก้ไขแต้มผิดพลาด", "หักค่าบริการ / สินค้า"];

export function UserDetailDialog({
  userId,
  open,
  onOpenChange,
  viewerRole,
  initialTab = "profile",
  onMutated,
}: {
  userId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewerRole: string;
  initialTab?: string;
  onMutated: () => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [detail, setDetail] = useState<ManagementDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ email: "", username: "", display_name: "", avatar_url: "" });
  const [passwordDraft, setPasswordDraft] = useState("");
  const [pointsAmount, setPointsAmount] = useState("");
  const [pointsReason, setPointsReason] = useState("");
  const [orders, setOrders] = useState<UserOrderRow[] | null>(null);
  const [ordersSearch, setOrdersSearch] = useState("");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit = canEditUsers(viewerRole);
  const canFinance = canAdjustPoints(viewerRole);

  useEffect(() => {
    if (!open || !userId) return;
    setTab(initialTab);
    setOrders(null);
    setOrdersSearch("");
    setLoading(true);
    adminApi
      .get<ManagementDetail>(`/users/${userId}/management-detail`)
      .then((data) => {
        setDetail(data);
        setProfileDraft({
          email: data.user.email || "",
          username: data.user.username || "",
          display_name: data.user.display_name || "",
          avatar_url: data.user.avatar_url || "",
        });
        setPasswordDraft("");
        setPointsAmount("");
        setPointsReason("");
      })
      .catch((err) => {
        toast.error(getErrorMessage(err));
        setDetail(null);
      })
      .finally(() => setLoading(false));
  }, [open, userId, initialTab]);

  async function refetchDetail() {
    if (!userId) return;
    try {
      const data = await adminApi.get<ManagementDetail>(`/users/${userId}/management-detail`);
      setDetail(data);
    } catch {
      // Keep showing the last known detail if the refetch itself fails.
    }
  }

  async function loadOrders() {
    if (!userId) return;
    setOrdersLoading(true);
    try {
      const q = ordersSearch.trim() ? `&search=${encodeURIComponent(ordersSearch.trim())}` : "";
      const res = await adminApi.get<{ orders: UserOrderRow[] }>(`/users/${userId}/orders?limit=100${q}`);
      setOrders(Array.isArray(res.orders) ? res.orders : []);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }

  function handleTabChange(next: string) {
    setTab(next);
    if (next === "orders" && orders === null) void loadOrders();
  }

  async function applyRole(role: string) {
    if (!userId) return;
    setBusy(true);
    try {
      await adminApi.post(`/users/${userId}/role`, { role });
      toast.success("อัปเดตสิทธิ์เรียบร้อย");
      await refetchDetail();
      onMutated();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBan(nextBanned: boolean) {
    if (!userId) return;
    setBusy(true);
    try {
      await adminApi.post(`/users/${userId}/${nextBanned ? "ban" : "unban"}`);
      toast.success(nextBanned ? "แบนผู้ใช้เรียบร้อย" : "ปลดแบนเรียบร้อย");
      await refetchDetail();
      onMutated();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    if (!userId) return;
    setBusy(true);
    try {
      await adminApi.put(`/users/${userId}/profile`, profileDraft);
      toast.success("บันทึกโปรไฟล์เรียบร้อย");
      await refetchDetail();
      onMutated();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!userId || passwordDraft.length < 8) return;
    setBusy(true);
    try {
      await adminApi.post(`/users/${userId}/password`, { password: passwordDraft });
      toast.success("รีเซ็ตรหัสผ่านเรียบร้อย");
      setPasswordDraft("");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function revokeSessions() {
    if (!userId) return;
    setBusy(true);
    try {
      await adminApi.post(`/users/${userId}/revoke-sessions`);
      toast.success("ยกเลิกเซสชันทั้งหมดเรียบร้อย");
      await refetchDetail();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitPoints() {
    if (!userId) return;
    const points = Number(pointsAmount);
    if (!Number.isFinite(points) || points === 0) {
      toast.error("กรุณาระบุจำนวนแต้มที่ถูกต้อง (ไม่เป็น 0)");
      return;
    }
    setBusy(true);
    try {
      await adminApi.post(`/users/${userId}/points`, { points, reason: pointsReason.trim() || "ปรับโดยแอดมิน" });
      toast.success(`ปรับแต้ม ${points > 0 ? "+" : ""}${points} เรียบร้อย`);
      setPointsAmount("");
      setPointsReason("");
      await refetchDetail();
      onMutated();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    if (!userId) return;
    setBusy(true);
    try {
      await adminApi.delete(`/users/${userId}`);
      toast.success("ลบผู้ใช้เรียบร้อย");
      onOpenChange(false);
      onMutated();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const user = detail?.user;
  const snap = detail?.snapshot;
  const sec = detail?.security;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="2xl"
      title={
        user ? (
          <div className="flex items-center gap-3">
            <Avatar className="size-10 rounded-lg">
              <AvatarImage src={user.avatar_url ?? undefined} alt={user.display_name || user.email} />
              <AvatarFallback>{getInitials(user.display_name || user.username || user.email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate">{user.display_name || user.username || user.email}</div>
              <div className="truncate font-normal text-muted-foreground text-xs">{user.email}</div>
            </div>
            <Badge variant={ROLE_BADGE_VARIANT[user.role] ?? "outline"} className="ml-auto capitalize">
              {ROLE_LABEL[user.role] ?? user.role}
            </Badge>
          </div>
        ) : (
          <span>{loading ? "กำลังโหลด…" : "ไม่พบผู้ใช้"}</span>
        )
      }
    >
      <>
        {user && detail && (
          <div className="flex flex-1 flex-col gap-4">
            <Tabs value={tab} onValueChange={handleTabChange}>
              <TabsList className="w-full">
                <TabsTrigger value="profile">โปรไฟล์</TabsTrigger>
                <TabsTrigger value="points">แต้ม</TabsTrigger>
                <TabsTrigger value="security">ความปลอดภัย</TabsTrigger>
                <TabsTrigger value="orders">ออเดอร์</TabsTrigger>
                <TabsTrigger value="activity">ประวัติ</TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="flex flex-col gap-4 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <StatBox label="แต้มคงเหลือ" value={formatNumber(user.balance)} />
                  <StatBox label="ออเดอร์ทั้งหมด" value={formatNumber(snap?.transactions_total ?? user.orders_count)} />
                </div>
                <div className="flex flex-col gap-3">
                  <Field label="Email">
                    <Input
                      value={profileDraft.email}
                      onChange={(e) => setProfileDraft((p) => ({ ...p, email: e.target.value }))}
                      disabled={!canEdit || busy}
                    />
                  </Field>
                  <Field label="Username">
                    <Input
                      value={profileDraft.username}
                      onChange={(e) => setProfileDraft((p) => ({ ...p, username: e.target.value }))}
                      disabled={!canEdit || busy}
                    />
                  </Field>
                  <Field label="ชื่อแสดง">
                    <Input
                      value={profileDraft.display_name}
                      onChange={(e) => setProfileDraft((p) => ({ ...p, display_name: e.target.value }))}
                      disabled={!canEdit || busy}
                    />
                  </Field>
                  <Field label="Avatar URL">
                    <Input
                      value={profileDraft.avatar_url}
                      onChange={(e) => setProfileDraft((p) => ({ ...p, avatar_url: e.target.value }))}
                      disabled={!canEdit || busy}
                    />
                  </Field>
                </div>
                {canEdit && (
                  <Button size="sm" onClick={saveProfile} disabled={busy} className="self-start">
                    บันทึกโปรไฟล์
                  </Button>
                )}

                <Separator />

                <Field label="สิทธิ์ / Role">
                  <NativeSelect
                    value={user.role}
                    onChange={(e) => applyRole(e.target.value)}
                    disabled={!canEdit || busy}
                    className="w-full"
                  >
                    {USER_ROLE_OPTIONS.map((r) => (
                      <NativeSelectOption key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <p className="mt-1 text-muted-foreground text-xs">owner › admin › finance / support / booster › user</p>
                </Field>
              </TabsContent>

              <TabsContent value="points" className="flex flex-col gap-4 pt-4">
                <div className="grid grid-cols-3 gap-3">
                  <StatBox label="แต้มคงเหลือ" value={formatNumber(user.balance)} />
                  <StatBox label="รับเข้าทั้งหมด" value={formatNumber(snap?.transactions_credit_points)} />
                  <StatBox label="ใช้ไปทั้งหมด" value={formatNumber(snap?.transactions_debit_points)} />
                </div>

                {canFinance && (
                  <div className="rounded-lg border p-3">
                    <p className="mb-2 font-medium text-sm">ปรับแต้มด่วน</p>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_POINT_AMOUNTS.map((v) => (
                        <Button key={v} type="button" variant="outline" size="xs" onClick={() => setPointsAmount(v)}>
                          +{v}
                        </Button>
                      ))}
                      {QUICK_POINT_AMOUNTS.map((v) => (
                        <Button key={`-${v}`} type="button" variant="outline" size="xs" onClick={() => setPointsAmount(String(-Number(v)))}>
                          -{v}
                        </Button>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Field label="จำนวน (+ หรือ -)">
                        <Input
                          type="number"
                          placeholder="เช่น 500 หรือ -100"
                          value={pointsAmount}
                          onChange={(e) => setPointsAmount(e.target.value)}
                        />
                      </Field>
                      <Field label="เหตุผล">
                        <Input placeholder="เช่น คืนแต้ม, เติมเงินมือ" value={pointsReason} onChange={(e) => setPointsReason(e.target.value)} />
                      </Field>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {QUICK_POINT_REASONS.map((r) => (
                        <Button key={r} type="button" variant="ghost" size="xs" onClick={() => setPointsReason(r)}>
                          {r}
                        </Button>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      className="mt-3"
                      onClick={submitPoints}
                      disabled={busy || !pointsAmount || Number(pointsAmount) === 0}
                    >
                      ยืนยัน {pointsAmount ? `(${Number(pointsAmount) > 0 ? "+" : ""}${pointsAmount})` : ""}
                    </Button>
                  </div>
                )}

                <div>
                  <p className="mb-2 font-medium text-muted-foreground text-xs">ประวัติธุรกรรมล่าสุด</p>
                  <div className="max-h-64 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ประเภท</TableHead>
                          <TableHead>แต้ม</TableHead>
                          <TableHead>วันที่</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.transactions.map((tx) => (
                          <TableRow key={tx.id}>
                            <TableCell>
                              <Badge variant={tx.type === "credit" ? "secondary" : "destructive"}>{tx.type}</Badge>
                            </TableCell>
                            <TableCell className={tx.type === "credit" ? "text-emerald-600" : "text-destructive"}>
                              {tx.type === "credit" ? "+" : "-"}
                              {formatNumber(tx.points)}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">{formatDateTime(tx.created_at)}</TableCell>
                          </TableRow>
                        ))}
                        {detail.transactions.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                              ไม่มีธุรกรรม
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="security" className="flex flex-col gap-4 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <StatBox label="เซสชันที่ใช้งานอยู่" value={`${sec?.active_sessions ?? 0} / ${sec?.total_sessions ?? 0}`} />
                  <StatBox label="เข้าสู่ระบบล่าสุด" value={sec?.last_session_at ? formatDateTime(sec.last_session_at) : "—"} />
                </div>

                <Field label="รีเซ็ตรหัสผ่าน">
                  <div className="flex gap-2">
                    <Input
                      placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)"
                      value={passwordDraft}
                      onChange={(e) => setPasswordDraft(e.target.value)}
                      disabled={!canEdit || busy}
                    />
                    <Button variant="outline" onClick={resetPassword} disabled={!canEdit || busy || passwordDraft.length < 8}>
                      รีเซ็ต
                    </Button>
                  </div>
                </Field>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={revokeSessions} disabled={!canEdit || busy}>
                    ยกเลิกเซสชันทั้งหมด
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleBan(!user.is_banned)} disabled={!canEdit || busy}>
                    {user.is_banned ? "ปลดแบน" : "แบนผู้ใช้"}
                  </Button>
                </div>

                <Separator />

                <div>
                  <p className="mb-2 font-medium text-destructive text-xs">Danger Zone</p>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={!canEdit || busy}>
                        ลบบัญชีผู้ใช้นี้
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>ยืนยันการลบบัญชี</AlertDialogTitle>
                        <AlertDialogDescription>
                          ยืนยันการลบ {user.display_name || user.email}? การกระทำนี้ไม่สามารถย้อนกลับได้
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                        <AlertDialogAction onClick={deleteUser}>ยืนยันลบ</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <div>
                  <p className="mb-2 font-medium text-muted-foreground text-xs">เซสชันที่เปิดอยู่</p>
                  <div className="max-h-48 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Token</TableHead>
                          <TableHead>เปิดเมื่อ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.sessions.map((s, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{s.token.slice(0, 12)}…</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{formatDateTime(s.created_at)}</TableCell>
                          </TableRow>
                        ))}
                        {detail.sessions.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={2} className="py-6 text-center text-muted-foreground">
                              ไม่มีเซสชัน
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="orders" className="flex flex-col gap-3 pt-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="ค้นหา Ref ID หรือชื่อสินค้า..."
                    value={ordersSearch}
                    onChange={(e) => setOrdersSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadOrders()}
                  />
                  <Button variant="outline" onClick={loadOrders} disabled={ordersLoading}>
                    ค้นหา
                  </Button>
                </div>
                <div className="max-h-96 overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>สินค้า</TableHead>
                        <TableHead>รหัสอ้างอิง</TableHead>
                        <TableHead>วันที่</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordersLoading && (
                        <TableRow>
                          <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                            กำลังโหลด…
                          </TableCell>
                        </TableRow>
                      )}
                      {!ordersLoading &&
                        (orders ?? []).map((o) => (
                          <TableRow key={o.order_item_id}>
                            <TableCell className="max-w-48 truncate">{o.product_name}</TableCell>
                            <TableCell className="text-primary text-xs">{o.ref || `#${o.order_id}`}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{formatDateTime(o.created_at)}</TableCell>
                          </TableRow>
                        ))}
                      {!ordersLoading && orders !== null && orders.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                            ไม่มีออเดอร์
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="activity" className="flex flex-col gap-4 pt-4">
                <div className="grid grid-cols-3 gap-3">
                  <StatBox label="เติมเงินทั้งหมด" value={String(snap?.topups_total ?? 0)} />
                  <StatBox label="อนุมัติแล้ว" value={String(snap?.topups_approved ?? 0)} />
                  <StatBox label="รอดำเนินการ" value={String(snap?.topups_pending ?? 0)} />
                </div>

                <div>
                  <p className="mb-2 font-medium text-muted-foreground text-xs">ประวัติการเติมเงิน</p>
                  <div className="max-h-48 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>จำนวน</TableHead>
                          <TableHead>วิธี</TableHead>
                          <TableHead>สถานะ</TableHead>
                          <TableHead>วันที่</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.topups.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell>{formatNumber(t.amount)} ฿</TableCell>
                            <TableCell>{t.method || t.provider}</TableCell>
                            <TableCell>
                              <Badge variant={t.status === "approved" ? "secondary" : "outline"}>{t.status}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">{formatDateTime(t.created_at)}</TableCell>
                          </TableRow>
                        ))}
                        {detail.topups.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                              ไม่มีประวัติ
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div>
                  <p className="mb-2 font-medium text-muted-foreground text-xs">Audit Log</p>
                  <div className="max-h-56 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Action</TableHead>
                          <TableHead>ผู้ดำเนินการ</TableHead>
                          <TableHead>วันที่</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.audits.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="font-mono text-xs">{a.action}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{a.actor_username || a.actor_email}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{formatDateTime(a.created_at)}</TableCell>
                          </TableRow>
                        ))}
                        {detail.audits.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                              ไม่มี audit log
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </>
    </FormDialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block font-normal text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2.5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-semibold text-lg tabular-nums">{value}</div>
    </div>
  );
}
