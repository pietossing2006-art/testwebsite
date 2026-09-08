"use client";

import { Wand2 } from "lucide-react";

import { GalleryImagesEditor } from "@/components/adminplus/gallery-images-editor";
import { ImageUploadCropper } from "@/components/adminplus/image-upload-cropper";
import {
  FormFieldsEditor,
  HighlightsEditor,
  ProductOptionsEditor,
  createProductOption,
  type FormField,
  type ProductOption,
} from "@/components/adminplus/product-field-editors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type SaleType = "digital_stock" | "farm_form" | "uid_form" | "mystery_box";

/**
 * The four ways a product is sold. `needsForm` marks the ones where the customer
 * types something in and staff fulfil by hand; `stockSource` mirrors how the server
 * computes remaining stock (see the CASE in server/db/catalog/products.js).
 */
export const SALE_TYPES: {
  value: SaleType;
  title: string;
  desc: string;
  needsForm: boolean;
  stockSource: "items" | "manual" | "prizes";
}[] = [
  {
    value: "digital_stock",
    title: "ส่งของอัตโนมัติจากสต็อก",
    desc: "ลูกค้าได้คีย์/รหัสทันที ตัดจากสต็อกที่เติมไว้",
    needsForm: false,
    stockSource: "items",
  },
  {
    value: "farm_form",
    title: "งานฟาร์ม / ต้องล็อกอินไอดี",
    desc: "ลูกค้ากรอกฟอร์ม (เช่น ไอดี-รหัส) แล้วทีมงานรับไปทำให้",
    needsForm: true,
    stockSource: "manual",
  },
  {
    value: "uid_form",
    title: "กรอก UID / ข้อมูลสั้น ๆ",
    desc: "ลูกค้ากรอกแค่ UID หรือข้อมูลระบุตัวตน ไม่ต้องส่งไอดีให้",
    needsForm: true,
    stockSource: "manual",
  },
  {
    value: "mystery_box",
    title: "กล่องสุ่ม",
    desc: "สุ่มรางวัลจากคลังรางวัลที่ตั้งไว้",
    needsForm: false,
    stockSource: "prizes",
  },
];

export const PRESET_BADGES = [
  { value: "HOT", label: "🔥 HOT" },
  { value: "SALE", label: "🏷️ SALE" },
  { value: "NEW", label: "✨ NEW" },
  { value: "LIMITED", label: "⚡ LIMITED" },
  { value: "BESTSELLER", label: "👑 BEST SELLER" },
];

export function saleTypeMeta(type: string) {
  return SALE_TYPES.find((t) => t.value === type) ?? SALE_TYPES[0];
}

/** Starter fields when a form type is picked and none exist yet (same as AdminV3's defaults). */
export function defaultFieldsFor(type: SaleType): FormField[] {
  if (type === "uid_form") {
    return [
      { id: "uid", label: "UID", type: "text", required: true },
      { id: "uid_confirmed", label: "ฉันยืนยันว่า UID ถูกต้อง", type: "checkbox", required: true },
    ];
  }
  if (type === "farm_form") {
    return [
      { id: "username", label: "Username", type: "text", required: true },
      { id: "password", label: "Password", type: "text", required: true },
      { id: "auth_key", label: "Auth Key", type: "text", required: false },
    ];
  }
  return [];
}

export function makeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export type ProductFormState = {
  id: number | null;
  category_id: string;
  name: string;
  slug: string;
  price: number | string;
  stock: number | string;
  description: string;
  image_url: string;
  highlights: string[];
  fulfillment_type: SaleType;
  sort_order: number;
  is_featured: boolean;
  is_unlimited_stock: boolean;
  use_options: boolean;
  badge: string;
  sku: string;
  min_order_qty: string;
  max_order_qty: string;
  product_options: ProductOption[];
  farm_form_fields: FormField[];
  gallery_images: string[];
};

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <h3 className="font-medium text-sm">{children}</h3>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block font-normal text-muted-foreground text-xs">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

export function ProductForm({
  form,
  setForm,
  categories,
  disabled,
}: {
  form: ProductFormState;
  setForm: (updater: (prev: ProductFormState) => ProductFormState) => void;
  categories: { id: number; name: string }[];
  disabled?: boolean;
}) {
  const meta = saleTypeMeta(form.fulfillment_type);

  /**
   * Switching sale type carries its own consequences: form products are fulfilled
   * by hand so they default to unlimited stock (otherwise the server's stock CASE
   * falls back to a raw 0 and the product reads as sold out), and they get starter
   * fields so the operator isn't staring at an empty form.
   */
  function changeSaleType(next: SaleType) {
    setForm((prev) => {
      if (prev.fulfillment_type === next) return prev;
      const nextMeta = saleTypeMeta(next);
      return {
        ...prev,
        fulfillment_type: next,
        is_unlimited_stock: nextMeta.needsForm ? true : prev.is_unlimited_stock,
        farm_form_fields:
          nextMeta.needsForm && prev.farm_form_fields.length === 0 ? defaultFieldsFor(next) : prev.farm_form_fields,
      };
    });
  }

  function toggleOptions(on: boolean) {
    setForm((prev) => ({
      ...prev,
      use_options: on,
      product_options: on && prev.product_options.length === 0 ? [createProductOption()] : prev.product_options,
    }));
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── 1. Sale type ─────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <SectionTitle hint="เลือกว่าสินค้านี้ส่งมอบยังไง — ตัวเลือกนี้กำหนดว่าลูกค้าต้องกรอกอะไรและนับสต็อกยังไง">
          ประเภทสินค้า
        </SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {SALE_TYPES.map((type) => {
            const active = form.fulfillment_type === type.value;
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => changeSaleType(type.value)}
                disabled={disabled}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  active ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", active ? "bg-primary" : "bg-muted-foreground/30")} />
                  <span className="font-medium text-sm">{type.title}</span>
                  {type.needsForm && (
                    <Badge variant="secondary" className="ml-auto">
                      ต้องกรอกฟอร์ม
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-muted-foreground text-xs">{type.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      <Separator />

      {/* ── 2. Basics ────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionTitle>ข้อมูลพื้นฐาน</SectionTitle>
        <Field label="ชื่อสินค้า">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: f.slug || makeSlug(e.target.value) }))}
            disabled={disabled}
          />
        </Field>

        <Field label="Slug (ใช้ในลิงก์สินค้า)" hint="ตัวพิมพ์เล็ก คั่นคำด้วยขีด — เว้นว่างไว้ระบบจะสร้างจากชื่อให้">
          <div className="flex gap-2">
            <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} disabled={disabled} className="font-mono text-xs" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setForm((f) => ({ ...f, slug: makeSlug(f.name) }))}
              disabled={disabled || !form.name.trim()}
              title="สร้าง slug ใหม่จากชื่อสินค้า"
            >
              <Wand2 /> สร้างจากชื่อ
            </Button>
          </div>
        </Field>

        <Field label="หมวดหมู่">
          <NativeSelect
            value={form.category_id}
            onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
            disabled={disabled}
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

        <Field label="คำอธิบาย">
          <Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} disabled={disabled} />
        </Field>
      </section>

      <Separator />

      {/* ── 3. Price & options ───────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionTitle hint="สินค้าขายแบบราคาเดียว หรือให้ลูกค้าเลือกแพ็ก/ตัวเลือกที่ราคาต่างกัน">ราคาและตัวเลือก</SectionTitle>

        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <Checkbox checked={form.use_options} onCheckedChange={(c) => toggleOptions(Boolean(c))} disabled={disabled} className="mt-0.5" />
          <span>
            มีตัวเลือกให้ลูกค้าเลือก
            <span className="block text-muted-foreground text-xs">
              เช่น แพ็ก 100 / 500 เพชร — เปิดแล้วราคาจะคิดตามตัวเลือก และสต็อกนับแยกรายตัวเลือก
            </span>
          </span>
        </label>

        {form.use_options ? (
          <>
            <ProductOptionsEditor
              options={form.product_options}
              onChange={(next) => setForm((f) => ({ ...f, product_options: next }))}
              disabled={disabled}
            />
            <Field label="ราคาตั้งต้น (พอยท์)" hint="ใช้เป็นราคาสำรองเมื่อยังไม่ได้เลือกตัวเลือก">
              <Input type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} disabled={disabled} />
            </Field>
          </>
        ) : (
          <Field label="ราคา (พอยท์)">
            <Input type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} disabled={disabled} />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Field label="สั่งขั้นต่ำ">
            <Input type="number" value={form.min_order_qty} onChange={(e) => setForm((f) => ({ ...f, min_order_qty: e.target.value }))} disabled={disabled} />
          </Field>
          <Field label="สั่งสูงสุด">
            <Input type="number" value={form.max_order_qty} onChange={(e) => setForm((f) => ({ ...f, max_order_qty: e.target.value }))} disabled={disabled} />
          </Field>
        </div>
      </section>

      <Separator />

      {/* ── 4. Customer form (only for the types that need one) ──── */}
      {meta.needsForm && (
        <>
          <section className="flex flex-col gap-3">
            <SectionTitle
              hint={
                form.fulfillment_type === "uid_form"
                  ? "ลูกค้ากรอกข้อมูลสั้น ๆ เช่น UID — ไม่ต้องส่งไอดี/รหัสให้ทีมงาน"
                  : "ลูกค้ากรอกข้อมูลที่ทีมงานต้องใช้เข้าไปทำงาน เช่น ไอดี รหัสผ่าน หรือ Auth Key"
              }
            >
              ฟอร์มที่ลูกค้าต้องกรอก
            </SectionTitle>
            <FormFieldsEditor
              fields={form.farm_form_fields}
              onChange={(next) => setForm((f) => ({ ...f, farm_form_fields: next }))}
              disabled={disabled}
              label="ฟิลด์ที่ให้ลูกค้ากรอก"
            />
          </section>
          <Separator />
        </>
      )}

      {/* ── 5. Stock, contextual to the sale type ────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionTitle>สต็อก</SectionTitle>

        {meta.needsForm ? (
          <>
            <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <Checkbox
                checked={form.is_unlimited_stock}
                onCheckedChange={(c) => setForm((f) => ({ ...f, is_unlimited_stock: Boolean(c) }))}
                disabled={disabled}
                className="mt-0.5"
              />
              <span>
                รับงานไม่จำกัดจำนวน
                <span className="block text-muted-foreground text-xs">
                  สินค้าประเภทนี้ทีมงานทำให้ทีละงาน ระบบจึงตั้งเป็นไม่จำกัดให้อัตโนมัติ — ถ้าต้องการจำกัดจำนวนที่รับได้ ให้เอาเครื่องหมายออกแล้วใส่จำนวน
                </span>
              </span>
            </label>
            {!form.is_unlimited_stock && (
              <Field label="จำนวนที่รับได้" hint="เมื่อรับครบจำนวนนี้ สินค้าจะขึ้นว่าของหมด">
                <Input type="number" value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} disabled={disabled} />
              </Field>
            )}
          </>
        ) : meta.stockSource === "prizes" ? (
          <p className="rounded-lg border bg-muted/40 p-3 text-muted-foreground text-xs">
            กล่องสุ่มนับจำนวนคงเหลือจากคลังรางวัล — ตั้งค่ารางวัลได้ที่โมดูลสต็อก
          </p>
        ) : (
          <>
            <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <Checkbox
                checked={form.is_unlimited_stock}
                onCheckedChange={(c) => setForm((f) => ({ ...f, is_unlimited_stock: Boolean(c) }))}
                disabled={disabled}
                className="mt-0.5"
              />
              <span>
                สต็อกไม่จำกัด
                <span className="block text-muted-foreground text-xs">ขายได้เรื่อย ๆ โดยไม่ตัดจำนวน</span>
              </span>
            </label>
            {!form.is_unlimited_stock &&
              (form.use_options ? (
                <p className="rounded-lg border bg-muted/40 p-3 text-muted-foreground text-xs">
                  สินค้ามีตัวเลือก — จำนวนคงเหลือนับแยกรายตัวเลือก ผูกสต็อกให้แต่ละตัวเลือกได้ที่โมดูลสต็อก
                </p>
              ) : (
                <Field label="จำนวนคงเหลือ" hint="เติมคีย์/รหัสทีละหลายรายการได้ที่โมดูลสต็อก">
                  <Input type="number" value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} disabled={disabled} />
                </Field>
              ))}
          </>
        )}
      </section>

      <Separator />

      {/* ── 6. Images ────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionTitle>รูปภาพ</SectionTitle>
        <ImageUploadCropper
          label="รูปภาพหลัก"
          value={form.image_url}
          onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
          aspectRatio={16 / 10}
          helpText="อัปโหลดจากเครื่องหรือวาง URL แล้วกด Crop เพื่อตัดสัดส่วน"
          disabled={disabled}
        />
        <GalleryImagesEditor
          images={form.gallery_images}
          onChange={(gallery) => setForm((f) => ({ ...f, gallery_images: gallery }))}
          aspectRatio={16 / 10}
          disabled={disabled}
        />
      </section>

      <Separator />

      {/* ── 7. Storefront presentation ───────────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionTitle>การแสดงผลหน้าร้าน</SectionTitle>

        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <Checkbox
            checked={form.is_featured}
            onCheckedChange={(c) => setForm((f) => ({ ...f, is_featured: Boolean(c) }))}
            disabled={disabled}
            className="mt-0.5"
          />
          <span>
            สินค้าแนะนำ
            <span className="block text-muted-foreground text-xs">ดันขึ้นโซนสินค้าแนะนำบนหน้าแรก</span>
          </span>
        </label>

        <Field label="ป้ายกำกับ" hint="ป้ายมุมรูปสินค้า เลือกจากที่มีหรือพิมพ์เองก็ได้">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {PRESET_BADGES.map((badge) => (
              <Button
                key={badge.value}
                type="button"
                size="xs"
                variant={form.badge === badge.value ? "default" : "outline"}
                onClick={() => setForm((f) => ({ ...f, badge: f.badge === badge.value ? "" : badge.value }))}
                disabled={disabled}
              >
                {badge.label}
              </Button>
            ))}
            {form.badge && (
              <Button type="button" size="xs" variant="ghost" onClick={() => setForm((f) => ({ ...f, badge: "" }))} disabled={disabled}>
                ล้างป้าย
              </Button>
            )}
          </div>
          <Input value={form.badge} onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))} placeholder="หรือพิมพ์ป้ายเอง" disabled={disabled} />
        </Field>

        <HighlightsEditor lines={form.highlights} onChange={(lines) => setForm((f) => ({ ...f, highlights: lines }))} disabled={disabled} />

        <Field label="SKU (รหัสสินค้าภายใน)" hint="ใช้อ้างอิงในระบบหลังบ้าน ลูกค้าไม่เห็น">
          <Input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} disabled={disabled} className="font-mono text-xs" />
        </Field>
      </section>
    </div>
  );
}
