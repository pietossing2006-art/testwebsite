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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";
import { formatDateTime, formatNumber } from "@/lib/adminplus/format";

export type PointCoupon = {
  id: number;
  code: string;
  points: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
};

export type Promotion = {
  id: number;
  scope: string;
  product_id: number | null;
  category_id: number | null;
  product_name?: string | null;
  category_name?: string | null;
  title: string | null;
  discount_percent: number | null;
  discount_amount_points: number | null;
  min_spend_points: number | null;
  max_discount_points: number | null;
  badge_text: string | null;
  is_flash_sale: boolean;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
};

export type DiscountCoupon = {
  id: number;
  code: string;
  title: string | null;
  discount_percent: number | null;
  discount_amount_points: number | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
};

export type SimpleProduct = { id: number; name: string };
export type SimpleCategory = { id: number; name: string };

const EMPTY_POINT_COUPON = { id: null as number | null, code: "", points: 0, max_uses: 0, expires_at: "", is_active: true };
const EMPTY_PROMOTION = {
  id: null as number | null,
  scope: "product",
  product_id: "",
  category_id: "",
  title: "",
  discount_percent: "",
  discount_amount_points: "",
  min_spend_points: "",
  max_discount_points: "",
  badge_text: "",
  is_flash_sale: false,
  starts_at: "",
  ends_at: "",
  is_active: true,
};
const EMPTY_DISCOUNT_COUPON = {
  id: null as number | null,
  code: "",
  title: "",
  discount_percent: "",
  discount_amount_points: "",
  max_uses: 0,
  expires_at: "",
  is_active: true,
};

function toIsoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function isoToLocalInput(value: string | null) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export function PromotionsManager({
  initialCoupons,
  initialPromotions,
  initialDiscountCoupons,
  products,
  categories,
}: {
  initialCoupons: PointCoupon[];
  initialPromotions: Promotion[];
  initialDiscountCoupons: DiscountCoupon[];
  products: SimpleProduct[];
  categories: SimpleCategory[];
}) {
  const [coupons, setCoupons] = useState(initialCoupons);
  const [promotions, setPromotions] = useState(initialPromotions);
  const [discountCoupons, setDiscountCoupons] = useState(initialDiscountCoupons);
  const [couponForm, setCouponForm] = useState(EMPTY_POINT_COUPON);
  const [promoForm, setPromoForm] = useState(EMPTY_PROMOTION);
  const [discountForm, setDiscountForm] = useState(EMPTY_DISCOUNT_COUPON);
  const [promoDialogOpen, setPromoDialogOpen] = useState(false);
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [couponDialogOpen, setCouponDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const [c, p, d] = await Promise.all([
        adminApi.get<{ coupons: PointCoupon[] }>("/coupons"),
        adminApi.get<{ promotions: Promotion[] }>("/promotions"),
        adminApi.get<{ coupons: DiscountCoupon[] }>("/discount-coupons"),
      ]);
      setCoupons(c.coupons ?? []);
      setPromotions(p.promotions ?? []);
      setDiscountCoupons(d.coupons ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function openPromoCreate() {
    setPromoForm(EMPTY_PROMOTION);
    setPromoDialogOpen(true);
  }

  function openDiscountCreate() {
    setDiscountForm(EMPTY_DISCOUNT_COUPON);
    setDiscountDialogOpen(true);
  }

  function openCouponCreate() {
    setCouponForm(EMPTY_POINT_COUPON);
    setCouponDialogOpen(true);
  }

  async function savePointCoupon() {
    const code = couponForm.code.trim();
    if (!code) return toast.error("กรุณากรอกโค้ดคูปอง");
    const body = {
      code,
      points: Number(couponForm.points) || 0,
      max_uses: Number(couponForm.max_uses) || 0,
      expires_at: toIsoOrNull(couponForm.expires_at),
      is_active: couponForm.is_active,
    };
    await run(async () => {
      if (couponForm.id) await adminApi.put(`/coupons/${couponForm.id}`, body);
      else await adminApi.post("/coupons", body);
      setCouponForm(EMPTY_POINT_COUPON);
      setCouponDialogOpen(false);
    }, couponForm.id ? "แก้ไขคูปองเรียบร้อย" : "สร้างคูปองเรียบร้อย");
  }

  async function savePromotion() {
    const body = {
      scope: promoForm.scope,
      product_id: promoForm.scope === "product" && promoForm.product_id ? Number(promoForm.product_id) : null,
      category_id: promoForm.scope === "category" && promoForm.category_id ? Number(promoForm.category_id) : null,
      title: promoForm.title.trim(),
      discount_percent: promoForm.discount_percent ? Number(promoForm.discount_percent) : null,
      discount_amount_points: promoForm.discount_amount_points ? Number(promoForm.discount_amount_points) : null,
      min_spend_points: promoForm.min_spend_points ? Number(promoForm.min_spend_points) : null,
      max_discount_points: promoForm.max_discount_points ? Number(promoForm.max_discount_points) : null,
      badge_text: promoForm.badge_text.trim(),
      is_flash_sale: promoForm.is_flash_sale,
      starts_at: toIsoOrNull(promoForm.starts_at),
      ends_at: toIsoOrNull(promoForm.ends_at),
      is_active: promoForm.is_active,
    };
    await run(async () => {
      if (promoForm.id) await adminApi.put(`/promotions/${promoForm.id}`, body);
      else await adminApi.post("/promotions", body);
      setPromoForm(EMPTY_PROMOTION);
      setPromoDialogOpen(false);
    }, promoForm.id ? "แก้ไขโปรโมชันเรียบร้อย" : "สร้างโปรโมชันเรียบร้อย");
  }

  async function saveDiscountCoupon() {
    const code = discountForm.code.trim();
    if (!code) return toast.error("กรุณากรอกโค้ดส่วนลด");
    const body = {
      code,
      title: discountForm.title.trim(),
      discount_percent: discountForm.discount_percent ? Number(discountForm.discount_percent) : null,
      discount_amount_points: discountForm.discount_amount_points ? Number(discountForm.discount_amount_points) : null,
      max_uses: Number(discountForm.max_uses) || 0,
      expires_at: toIsoOrNull(discountForm.expires_at),
      is_active: discountForm.is_active,
    };
    await run(async () => {
      if (discountForm.id) await adminApi.put(`/discount-coupons/${discountForm.id}`, body);
      else await adminApi.post("/discount-coupons", body);
      setDiscountForm(EMPTY_DISCOUNT_COUPON);
      setDiscountDialogOpen(false);
    }, discountForm.id ? "แก้ไขส่วนลดเรียบร้อย" : "สร้างส่วนลดเรียบร้อย");
  }

  return (
    <Tabs defaultValue="promotions">
      <TabsList>
        <TabsTrigger value="promotions">โปรโมชันสินค้า</TabsTrigger>
        <TabsTrigger value="discounts">คูปองส่วนลด</TabsTrigger>
        <TabsTrigger value="points">คูปองเติมพอยท์</TabsTrigger>
      </TabsList>

      <TabsContent value="promotions" className="pt-4">
        <>
          <Card className="gap-0 py-0">
            <CardHeader className="flex-row items-center justify-between border-b px-4 py-3">
              <CardTitle className="text-base">โปรโมชัน ({promotions.length})</CardTitle>
              <Button size="sm" onClick={openPromoCreate} disabled={busy}>
                <Plus /> สร้างโปรโมชัน
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>โปรโมชัน</TableHead>
                    <TableHead>ขอบเขต</TableHead>
                    <TableHead>ส่วนลด</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promotions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        ยังไม่มีโปรโมชัน
                      </TableCell>
                    </TableRow>
                  )}
                  {promotions.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="max-w-48 truncate font-medium text-sm">{p.title || `#${p.id}`}</div>
                        {p.is_flash_sale && <Badge variant="destructive">Flash sale</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.scope === "category" ? p.category_name || `category #${p.category_id}` : p.product_name || `product #${p.product_id}`}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.discount_percent ? `${p.discount_percent}%` : p.discount_amount_points ? `${formatNumber(p.discount_amount_points)} พอยท์` : "-"}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(() => adminApi.put(`/promotions/${p.id}/toggle`, { is_active: !p.is_active }), "อัปเดตสถานะเรียบร้อย")}
                        >
                          <Badge variant={p.is_active ? "secondary" : "outline"}>{p.is_active ? "เปิด" : "ปิด"}</Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={busy}
                            onClick={() => {
                              setPromoForm({
                                id: p.id,
                                scope: p.scope || "product",
                                product_id: p.product_id ? String(p.product_id) : "",
                                category_id: p.category_id ? String(p.category_id) : "",
                                title: p.title ?? "",
                                discount_percent: p.discount_percent ? String(p.discount_percent) : "",
                                discount_amount_points: p.discount_amount_points ? String(p.discount_amount_points) : "",
                                min_spend_points: p.min_spend_points ? String(p.min_spend_points) : "",
                                max_discount_points: p.max_discount_points ? String(p.max_discount_points) : "",
                                badge_text: p.badge_text ?? "",
                                is_flash_sale: Boolean(p.is_flash_sale),
                                starts_at: isoToLocalInput(p.starts_at),
                                ends_at: isoToLocalInput(p.ends_at),
                                is_active: p.is_active,
                              });
                              setPromoDialogOpen(true);
                            }}
                          >
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon-xs" disabled={busy} onClick={() => run(() => adminApi.delete(`/promotions/${p.id}`), "ลบโปรโมชันเรียบร้อย")}>
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
            open={promoDialogOpen}
            onOpenChange={setPromoDialogOpen}
            title={promoForm.id ? `แก้ไขโปรโมชัน #${promoForm.id}` : "สร้างโปรโมชัน"}
            size="lg"
            footer={
              <>
                <Button size="sm" variant="outline" onClick={() => setPromoDialogOpen(false)} disabled={busy}>
                  ยกเลิก
                </Button>
                <Button size="sm" onClick={savePromotion} disabled={busy}>
                  {promoForm.id ? "บันทึก" : "สร้าง"}
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              <Field label="ชื่อโปรโมชัน">
                <Input value={promoForm.title} onChange={(e) => setPromoForm((f) => ({ ...f, title: e.target.value }))} disabled={busy} />
              </Field>
              <Field label="ขอบเขต">
                <NativeSelect value={promoForm.scope} onChange={(e) => setPromoForm((f) => ({ ...f, scope: e.target.value }))} disabled={busy} className="w-full">
                  <NativeSelectOption value="product">สินค้าเฉพาะชิ้น</NativeSelectOption>
                  <NativeSelectOption value="category">ทั้งหมวดหมู่</NativeSelectOption>
                </NativeSelect>
              </Field>
              {promoForm.scope === "product" ? (
                <Field label="สินค้า">
                  <NativeSelect
                    value={promoForm.product_id}
                    onChange={(e) => setPromoForm((f) => ({ ...f, product_id: e.target.value }))}
                    disabled={busy}
                    className="w-full"
                  >
                    <NativeSelectOption value="">เลือกสินค้า…</NativeSelectOption>
                    {products.map((p) => (
                      <NativeSelectOption key={p.id} value={String(p.id)}>
                        {p.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              ) : (
                <Field label="หมวดหมู่">
                  <NativeSelect
                    value={promoForm.category_id}
                    onChange={(e) => setPromoForm((f) => ({ ...f, category_id: e.target.value }))}
                    disabled={busy}
                    className="w-full"
                  >
                    <NativeSelectOption value="">เลือกหมวดหมู่…</NativeSelectOption>
                    {categories.map((c) => (
                      <NativeSelectOption key={c.id} value={String(c.id)}>
                        {c.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label="ลด (%)">
                  <Input type="number" value={promoForm.discount_percent} onChange={(e) => setPromoForm((f) => ({ ...f, discount_percent: e.target.value }))} disabled={busy} />
                </Field>
                <Field label="ลด (พอยท์)">
                  <Input
                    type="number"
                    value={promoForm.discount_amount_points}
                    onChange={(e) => setPromoForm((f) => ({ ...f, discount_amount_points: e.target.value }))}
                    disabled={busy}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="ซื้อขั้นต่ำ">
                  <Input type="number" value={promoForm.min_spend_points} onChange={(e) => setPromoForm((f) => ({ ...f, min_spend_points: e.target.value }))} disabled={busy} />
                </Field>
                <Field label="ลดสูงสุด">
                  <Input
                    type="number"
                    value={promoForm.max_discount_points}
                    onChange={(e) => setPromoForm((f) => ({ ...f, max_discount_points: e.target.value }))}
                    disabled={busy}
                  />
                </Field>
              </div>
              <Field label="ป้ายกำกับ">
                <Input value={promoForm.badge_text} onChange={(e) => setPromoForm((f) => ({ ...f, badge_text: e.target.value }))} disabled={busy} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="เริ่ม">
                  <Input type="datetime-local" value={promoForm.starts_at} onChange={(e) => setPromoForm((f) => ({ ...f, starts_at: e.target.value }))} disabled={busy} />
                </Field>
                <Field label="สิ้นสุด">
                  <Input type="datetime-local" value={promoForm.ends_at} onChange={(e) => setPromoForm((f) => ({ ...f, ends_at: e.target.value }))} disabled={busy} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={promoForm.is_flash_sale} onCheckedChange={(c) => setPromoForm((f) => ({ ...f, is_flash_sale: Boolean(c) }))} />
                Flash sale
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={promoForm.is_active} onCheckedChange={(c) => setPromoForm((f) => ({ ...f, is_active: Boolean(c) }))} />
                เปิดใช้งาน
              </label>
            </div>
          </FormDialog>
        </>
      </TabsContent>

      <TabsContent value="discounts" className="pt-4">
        <>
          <Card className="gap-0 py-0">
            <CardHeader className="flex-row items-center justify-between border-b px-4 py-3">
              <CardTitle className="text-base">คูปองส่วนลด ({discountCoupons.length})</CardTitle>
              <Button size="sm" onClick={openDiscountCreate} disabled={busy}>
                <Plus /> สร้างคูปองส่วนลด
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>โค้ด</TableHead>
                    <TableHead>ส่วนลด</TableHead>
                    <TableHead>ใช้แล้ว</TableHead>
                    <TableHead>หมดอายุ</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discountCoupons.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        ยังไม่มีคูปองส่วนลด
                      </TableCell>
                    </TableRow>
                  )}
                  {discountCoupons.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-mono font-medium text-sm">{c.code}</div>
                        <div className="text-muted-foreground text-xs">{c.title}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.discount_percent ? `${c.discount_percent}%` : c.discount_amount_points ? `${formatNumber(c.discount_amount_points)} พอยท์` : "-"}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {c.used_count} / {c.max_uses || "∞"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{c.expires_at ? formatDateTime(c.expires_at) : "ไม่มีกำหนด"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={busy}
                            onClick={() => {
                              setDiscountForm({
                                id: c.id,
                                code: c.code,
                                title: c.title ?? "",
                                discount_percent: c.discount_percent ? String(c.discount_percent) : "",
                                discount_amount_points: c.discount_amount_points ? String(c.discount_amount_points) : "",
                                max_uses: c.max_uses ?? 0,
                                expires_at: isoToLocalInput(c.expires_at),
                                is_active: c.is_active,
                              });
                              setDiscountDialogOpen(true);
                            }}
                          >
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon-xs" disabled={busy} onClick={() => run(() => adminApi.delete(`/discount-coupons/${c.id}`), "ลบคูปองเรียบร้อย")}>
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
            open={discountDialogOpen}
            onOpenChange={setDiscountDialogOpen}
            title={discountForm.id ? `แก้ไขคูปองส่วนลด #${discountForm.id}` : "สร้างคูปองส่วนลด"}
            size="lg"
            footer={
              <>
                <Button size="sm" variant="outline" onClick={() => setDiscountDialogOpen(false)} disabled={busy}>
                  ยกเลิก
                </Button>
                <Button size="sm" onClick={saveDiscountCoupon} disabled={busy}>
                  {discountForm.id ? "บันทึก" : "สร้าง"}
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              <Field label="โค้ด">
                <Input value={discountForm.code} onChange={(e) => setDiscountForm((f) => ({ ...f, code: e.target.value }))} disabled={busy || Boolean(discountForm.id)} />
              </Field>
              <Field label="ชื่อ / คำอธิบาย">
                <Input value={discountForm.title} onChange={(e) => setDiscountForm((f) => ({ ...f, title: e.target.value }))} disabled={busy} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="ลด (%)">
                  <Input
                    type="number"
                    value={discountForm.discount_percent}
                    onChange={(e) => setDiscountForm((f) => ({ ...f, discount_percent: e.target.value }))}
                    disabled={busy}
                  />
                </Field>
                <Field label="ลด (พอยท์)">
                  <Input
                    type="number"
                    value={discountForm.discount_amount_points}
                    onChange={(e) => setDiscountForm((f) => ({ ...f, discount_amount_points: e.target.value }))}
                    disabled={busy}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="ใช้ได้สูงสุด (0 = ไม่จำกัด)">
                  <Input type="number" value={discountForm.max_uses} onChange={(e) => setDiscountForm((f) => ({ ...f, max_uses: Number(e.target.value) }))} disabled={busy} />
                </Field>
                <Field label="หมดอายุ">
                  <Input type="datetime-local" value={discountForm.expires_at} onChange={(e) => setDiscountForm((f) => ({ ...f, expires_at: e.target.value }))} disabled={busy} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={discountForm.is_active} onCheckedChange={(c) => setDiscountForm((f) => ({ ...f, is_active: Boolean(c) }))} />
                เปิดใช้งาน
              </label>
            </div>
          </FormDialog>
        </>
      </TabsContent>

      <TabsContent value="points" className="pt-4">
        <>
          <Card className="gap-0 py-0">
            <CardHeader className="flex-row items-center justify-between border-b px-4 py-3">
              <CardTitle className="text-base">คูปองเติมพอยท์ ({coupons.length})</CardTitle>
              <Button size="sm" onClick={openCouponCreate} disabled={busy}>
                <Plus /> สร้างคูปอง
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>โค้ด</TableHead>
                    <TableHead className="text-right">พอยท์</TableHead>
                    <TableHead>ใช้แล้ว</TableHead>
                    <TableHead>หมดอายุ</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coupons.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        ยังไม่มีคูปอง
                      </TableCell>
                    </TableRow>
                  )}
                  {coupons.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm">{c.code}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(c.points)}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {c.used_count} / {c.max_uses || "∞"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{c.expires_at ? formatDateTime(c.expires_at) : "ไม่มีกำหนด"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={busy}
                            onClick={() => {
                              setCouponForm({
                                id: c.id,
                                code: c.code,
                                points: c.points,
                                max_uses: c.max_uses ?? 0,
                                expires_at: isoToLocalInput(c.expires_at),
                                is_active: c.is_active,
                              });
                              setCouponDialogOpen(true);
                            }}
                          >
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon-xs" disabled={busy} onClick={() => run(() => adminApi.delete(`/coupons/${c.id}`), "ลบคูปองเรียบร้อย")}>
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
            open={couponDialogOpen}
            onOpenChange={setCouponDialogOpen}
            title={couponForm.id ? `แก้ไขคูปอง #${couponForm.id}` : "สร้างคูปองเติมพอยท์"}
            size="lg"
            footer={
              <>
                <Button size="sm" variant="outline" onClick={() => setCouponDialogOpen(false)} disabled={busy}>
                  ยกเลิก
                </Button>
                <Button size="sm" onClick={savePointCoupon} disabled={busy}>
                  {couponForm.id ? "บันทึก" : "สร้าง"}
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              <Field label="โค้ด">
                <Input value={couponForm.code} onChange={(e) => setCouponForm((f) => ({ ...f, code: e.target.value }))} disabled={busy || Boolean(couponForm.id)} />
              </Field>
              <Field label="พอยท์ที่ได้รับ">
                <Input type="number" value={couponForm.points} onChange={(e) => setCouponForm((f) => ({ ...f, points: Number(e.target.value) }))} disabled={busy} />
              </Field>
              <Field label="ใช้ได้สูงสุด (0 = ไม่จำกัด)">
                <Input type="number" value={couponForm.max_uses} onChange={(e) => setCouponForm((f) => ({ ...f, max_uses: Number(e.target.value) }))} disabled={busy} />
              </Field>
              <Field label="หมดอายุ">
                <Input type="datetime-local" value={couponForm.expires_at} onChange={(e) => setCouponForm((f) => ({ ...f, expires_at: e.target.value }))} disabled={busy} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={couponForm.is_active} onCheckedChange={(c) => setCouponForm((f) => ({ ...f, is_active: Boolean(c) }))} />
                เปิดใช้งาน
              </label>
            </div>
          </FormDialog>
        </>
      </TabsContent>
    </Tabs>
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
