"use client";

import { useMemo, useState } from "react";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { FormDialog } from "@/components/adminplus/form-dialog";
import { ImageUploadCropper } from "@/components/adminplus/image-upload-cropper";
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
import { formatNumber } from "@/lib/adminplus/format";

export type BundleItem = { product_id: number; product_option_id: string | null; qty: number; product_name?: string | null };

export type Bundle = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  bundle_price: number;
  is_active: boolean;
  is_hidden: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  items: BundleItem[];
};

export type BundleProduct = { id: number; name: string; price: number; product_options?: { id: string; label?: string; price?: number }[] };

const EMPTY_FORM = {
  id: null as number | null,
  name: "",
  slug: "",
  description: "",
  image_url: "",
  bundle_price: "",
  is_active: true,
  is_hidden: false,
  sort_order: 0,
  starts_at: "",
  ends_at: "",
  items: [] as BundleItem[],
};

function isoToLocalInput(value: string | null) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function makeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function BundlesManager({ initialBundles, products }: { initialBundles: Bundle[]; products: BundleProduct[] }) {
  const [bundles, setBundles] = useState(initialBundles);
  const [form, setForm] = useState(EMPTY_FORM);
  const [newItem, setNewItem] = useState({ product_id: "", product_option_id: "", qty: 1 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const originalPrice = form.items.reduce((sum, item) => {
    const product = productById.get(Number(item.product_id));
    const option = product?.product_options?.find((o) => String(o.id) === String(item.product_option_id));
    const unit = Number(option?.price ?? product?.price ?? 0);
    return sum + unit * (Number(item.qty) || 1);
  }, 0);

  async function reload() {
    try {
      const res = await adminApi.get<{ bundles: Bundle[] }>("/bundles");
      setBundles(res.bundles ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function save() {
    const name = form.name.trim();
    if (!name) return toast.error("กรุณากรอกชื่อชุดสินค้า");
    if (form.items.length < 1) return toast.error("ต้องมีสินค้าในชุดอย่างน้อย 1 รายการ");

    const body = {
      name,
      slug: form.slug.trim() || makeSlug(name),
      description: form.description.trim(),
      image_url: form.image_url.trim(),
      bundle_price: Number(form.bundle_price) || 0,
      is_active: form.is_active,
      is_hidden: form.is_hidden,
      sort_order: Number(form.sort_order) || 0,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      items: form.items.map((item) => ({
        product_id: Number(item.product_id),
        product_option_id: item.product_option_id || null,
        qty: Math.max(1, Math.trunc(Number(item.qty) || 1)),
      })),
    };

    setBusy(true);
    try {
      if (form.id) await adminApi.put(`/bundles/${form.id}`, body);
      else await adminApi.post("/bundles", body);
      toast.success(form.id ? "แก้ไขชุดสินค้าเรียบร้อย" : "สร้างชุดสินค้าเรียบร้อย");
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
      await adminApi.delete(`/bundles/${id}`);
      toast.success("ลบชุดสินค้าเรียบร้อย");
      if (form.id === id) setForm(EMPTY_FORM);
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function edit(b: Bundle) {
    setForm({
      id: b.id,
      name: b.name ?? "",
      slug: b.slug ?? "",
      description: b.description ?? "",
      image_url: b.image_url ?? "",
      bundle_price: String(b.bundle_price ?? ""),
      is_active: b.is_active !== false,
      is_hidden: Boolean(b.is_hidden),
      sort_order: b.sort_order ?? 0,
      starts_at: isoToLocalInput(b.starts_at),
      ends_at: isoToLocalInput(b.ends_at),
      items: (b.items ?? []).map((i) => ({
        product_id: Number(i.product_id),
        product_option_id: i.product_option_id ? String(i.product_option_id) : "",
        qty: Number(i.qty) || 1,
        product_name: i.product_name ?? productById.get(Number(i.product_id))?.name ?? `#${i.product_id}`,
      })),
    });
    setDialogOpen(true);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setNewItem({ product_id: "", product_option_id: "", qty: 1 });
    setDialogOpen(true);
  }

  function addItem() {
    const productId = Number(newItem.product_id);
    const product = productById.get(productId);
    if (!product) return toast.error("กรุณาเลือกสินค้า");
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_id: productId,
          product_option_id: newItem.product_option_id || null,
          qty: Math.max(1, Number(newItem.qty) || 1),
          product_name: product.name,
        },
      ],
    }));
    setNewItem({ product_id: "", product_option_id: "", qty: 1 });
  }

  const selectedProduct = productById.get(Number(newItem.product_id));

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="flex-row items-center justify-between border-b px-4 py-3">
          <CardTitle className="text-base">ชุดสินค้า ({bundles.length})</CardTitle>
          <Button size="sm" onClick={openCreate} disabled={busy}>
            <Plus /> สร้างชุดสินค้า
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ชุดสินค้า</TableHead>
                <TableHead className="text-right">ราคา</TableHead>
                <TableHead>จำนวนสินค้า</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bundles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    ยังไม่มีชุดสินค้า
                  </TableCell>
                </TableRow>
              )}
              {bundles.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="max-w-56 truncate font-medium text-sm">{b.name}</div>
                    <div className="truncate text-muted-foreground text-xs">{b.slug}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(b.bundle_price)}</TableCell>
                  <TableCell className="text-xs">{(b.items ?? []).length} รายการ</TableCell>
                  <TableCell>
                    <Badge variant={b.is_active ? "secondary" : "outline"}>{b.is_active ? "เปิด" : "ปิด"}</Badge>
                    {b.is_hidden && (
                      <Badge variant="outline" className="ml-1">
                        ซ่อน
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-xs" onClick={() => edit(b)} disabled={busy}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => remove(b.id)} disabled={busy}>
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
        title={form.id ? `แก้ไขชุด #${form.id}` : "สร้างชุดสินค้า"}
        size="xl"
        footer={
          <>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              ยกเลิก
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              {form.id ? "บันทึก" : "สร้างชุด"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="ชื่อชุด">
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: f.slug || makeSlug(e.target.value) }))}
              disabled={busy}
            />
          </Field>
          <Field label="Slug">
            <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} disabled={busy} />
          </Field>
          <Field label="คำอธิบาย">
            <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} disabled={busy} />
          </Field>
          <ImageUploadCropper
            label="รูปภาพ Bundle"
            value={form.image_url}
            onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
            aspectRatio={16 / 9}
            helpText="อัปโหลดรูปชุด Bundle หรือตัดแต่งสัดส่วน 16:9 ได้ทันที"
            disabled={busy}
          />

          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-sm">สินค้าในชุด</span>
              <Badge variant="secondary">{form.items.length} รายการ</Badge>
            </div>
            <div className="flex flex-col gap-2">
              {form.items.map((item, index) => (
                <div key={`${item.product_id}-${item.product_option_id}-${index}`} className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{item.product_name || `#${item.product_id}`}</span>
                  <Input
                    type="number"
                    className="h-7 w-16"
                    value={item.qty}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        items: f.items.map((it, i) => (i === index ? { ...it, qty: Math.max(1, Number(e.target.value) || 1) } : it)),
                      }))
                    }
                    disabled={busy}
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }))}
                    disabled={busy}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <NativeSelect
                size="sm"
                value={newItem.product_id}
                onChange={(e) => setNewItem({ product_id: e.target.value, product_option_id: "", qty: 1 })}
                disabled={busy}
                className="flex-1"
              >
                <NativeSelectOption value="">เลือกสินค้า…</NativeSelectOption>
                {products.map((p) => (
                  <NativeSelectOption key={p.id} value={String(p.id)}>
                    {p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {(selectedProduct?.product_options?.length ?? 0) > 0 && (
                <NativeSelect
                  size="sm"
                  value={newItem.product_option_id}
                  onChange={(e) => setNewItem((n) => ({ ...n, product_option_id: e.target.value }))}
                  disabled={busy}
                >
                  <NativeSelectOption value="">ตัวเลือกเริ่มต้น</NativeSelectOption>
                  {selectedProduct?.product_options?.map((o) => (
                    <NativeSelectOption key={o.id} value={String(o.id)}>
                      {o.label ?? o.id}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
              <Button size="sm" variant="outline" onClick={addItem} disabled={busy || !newItem.product_id}>
                <Plus /> เพิ่ม
              </Button>
            </div>
            {originalPrice > 0 && (
              <p className="mt-2 text-muted-foreground text-xs">ราคาปกติรวม {formatNumber(originalPrice)} พอยท์</p>
            )}
          </div>

          <Field label="ราคาชุด (พอยท์)">
            <Input type="number" value={form.bundle_price} onChange={(e) => setForm((f) => ({ ...f, bundle_price: e.target.value }))} disabled={busy} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="เริ่ม">
              <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} disabled={busy} />
            </Field>
            <Field label="สิ้นสุด">
              <Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))} disabled={busy} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.is_active} onCheckedChange={(c) => setForm((f) => ({ ...f, is_active: Boolean(c) }))} />
            เปิดใช้งาน
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.is_hidden} onCheckedChange={(c) => setForm((f) => ({ ...f, is_hidden: Boolean(c) }))} />
            ซ่อนจากหน้าร้าน
          </label>
        </div>
      </FormDialog>
    </>
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
