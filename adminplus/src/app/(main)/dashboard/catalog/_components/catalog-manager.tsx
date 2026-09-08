"use client";

import { useMemo, useState } from "react";

import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FormDialog } from "@/components/adminplus/form-dialog";
import { ImageUploadCropper } from "@/components/adminplus/image-upload-cropper";
import {
  type FormField,
  joinHighlights,
  normalizeFormFieldsForSubmit,
  normalizeProductOptionsForSubmit,
  type ProductOption,
  parseFormFields,
  parseProductOptions,
  splitHighlights,
} from "@/components/adminplus/product-field-editors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";
import { formatNumber } from "@/lib/adminplus/format";

import { makeSlug, ProductForm, type ProductFormState, type SaleType, saleTypeMeta } from "./product-form";

export type Category = {
  id: number;
  name: string;
  slug: string;
  image_url: string | null;
  description: string | null;
  parent_id: number | null;
  sort_order: number;
  icon: string | null;
  is_hidden: boolean;
};

export type Product = {
  id: number;
  category_id: number;
  category_name?: string | null;
  name: string;
  slug: string;
  price: number;
  stock: number;
  description: string | null;
  image_url: string | null;
  highlights: string | null;
  fulfillment_type: string;
  sort_order: number;
  is_featured: boolean;
  is_hidden: boolean;
  is_unlimited_stock: boolean;
  badge: string | null;
  sku: string | null;
  min_order_qty: number | null;
  max_order_qty: number | null;
  gallery_images?: unknown;
  product_options?: unknown;
  farm_form_fields?: unknown;
};

const EMPTY_CATEGORY = {
  id: null as number | null,
  name: "",
  slug: "",
  image_url: "",
  description: "",
  parent_id: "",
  sort_order: 0,
  icon: "",
};

const EMPTY_PRODUCT: ProductFormState = {
  id: null,
  category_id: "",
  name: "",
  slug: "",
  price: 0,
  stock: 0,
  description: "",
  image_url: "",
  highlights: [],
  fulfillment_type: "digital_stock",
  sort_order: 0,
  is_featured: false,
  is_unlimited_stock: false,
  use_options: false,
  badge: "",
  sku: "",
  min_order_qty: "",
  max_order_qty: "",
  product_options: [],
  farm_form_fields: [],
  gallery_images: [],
};

/** Same shape AdminV3 submitted: a flat array of non-empty URL strings. */
function normalizeGalleryImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((img) => (typeof img === "string" ? img.trim() : String((img as { url?: string })?.url ?? "").trim()))
    .filter(Boolean);
}

export function CatalogManager({
  initialCategories,
  initialProducts,
}: {
  initialCategories: Category[];
  initialProducts: Product[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [products, setProducts] = useState(initialProducts);
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY);
  const [productForm, setProductForm] = useState<ProductFormState>(EMPTY_PRODUCT);
  const [filter, setFilter] = useState({ search: "", categoryId: "all", hidden: "all" });
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const visibleProducts = products.filter((p) => {
    const q = filter.search.trim().toLowerCase();
    if (q && !`${p.name} ${p.slug} ${p.sku ?? ""}`.toLowerCase().includes(q)) return false;
    if (filter.categoryId !== "all" && String(p.category_id) !== filter.categoryId) return false;
    if (filter.hidden === "hidden" && !p.is_hidden) return false;
    if (filter.hidden === "visible" && p.is_hidden) return false;
    return true;
  });

  async function reload() {
    try {
      const [catRes, prodRes] = await Promise.all([
        adminApi.get<{ categories: Category[] }>("/categories"),
        adminApi.get<{ products: Product[] }>("/products"),
      ]);
      setCategories(catRes.categories ?? []);
      setProducts(prodRes.products ?? []);
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

  async function saveCategory() {
    const name = categoryForm.name.trim();
    if (!name) return toast.error("กรุณากรอกชื่อหมวดหมู่");
    const body = {
      name,
      slug: categoryForm.slug.trim() || makeSlug(name),
      image_url: categoryForm.image_url.trim(),
      description: categoryForm.description.trim(),
      parent_id: categoryForm.parent_id ? Number(categoryForm.parent_id) : null,
      sort_order: Number(categoryForm.sort_order) || 0,
      icon: categoryForm.icon.trim(),
    };
    await run(
      async () => {
        if (categoryForm.id) await adminApi.put(`/categories/${categoryForm.id}`, body);
        else await adminApi.post("/categories", body);
        setCategoryForm(EMPTY_CATEGORY);
        setCategoryDialogOpen(false);
      },
      categoryForm.id ? "แก้ไขหมวดหมู่เรียบร้อย" : "สร้างหมวดหมู่เรียบร้อย",
    );
  }

  async function saveProduct() {
    const name = productForm.name.trim();
    if (!name) return toast.error("กรุณากรอกชื่อสินค้า");
    if (!productForm.category_id) return toast.error("กรุณาเลือกหมวดหมู่");

    // Options and customer-form fields only apply to the modes that use them, so
    // switching a product's type never leaves stale data behind on the server.
    const meta = saleTypeMeta(productForm.fulfillment_type);
    let options: ProductOption[] = [];
    let farmFields: FormField[] = [];
    try {
      if (productForm.use_options) options = normalizeProductOptionsForSubmit(productForm.product_options);
      if (meta.needsForm) farmFields = normalizeFormFieldsForSubmit(productForm.farm_form_fields);
    } catch (err) {
      return toast.error(err instanceof Error ? err.message : "ข้อมูลไม่ถูกต้อง");
    }
    if (productForm.use_options && options.length === 0) {
      return toast.error("เปิดใช้ตัวเลือกไว้แต่ยังไม่มีตัวเลือก — เพิ่มอย่างน้อย 1 รายการ หรือปิดการใช้ตัวเลือก");
    }
    if (meta.needsForm && farmFields.length === 0) {
      return toast.error("สินค้าประเภทนี้ต้องมีฟิลด์ให้ลูกค้ากรอกอย่างน้อย 1 ช่อง");
    }

    const body: Record<string, unknown> = {
      category_id: Number(productForm.category_id),
      name,
      slug: productForm.slug.trim() || makeSlug(name),
      price: Number(productForm.price) || 0,
      stock: Number(productForm.stock) || 0,
      description: productForm.description.trim(),
      image_url: productForm.image_url.trim(),
      highlights: joinHighlights(productForm.highlights),
      fulfillment_type: productForm.fulfillment_type,
      sort_order: Number(productForm.sort_order) || 0,
      is_featured: productForm.is_featured,
      is_unlimited_stock: productForm.is_unlimited_stock,
      badge: productForm.badge.trim(),
      sku: productForm.sku.trim(),
      min_order_qty: productForm.min_order_qty ? Number(productForm.min_order_qty) : null,
      max_order_qty: productForm.max_order_qty ? Number(productForm.max_order_qty) : null,
      gallery_images: normalizeGalleryImages(productForm.gallery_images),
    };
    body.product_options = options;
    body.farm_form_fields = farmFields;

    await run(
      async () => {
        if (productForm.id) await adminApi.put(`/products/${productForm.id}`, body);
        else await adminApi.post("/products", body);
        setProductForm(EMPTY_PRODUCT);
        setProductDialogOpen(false);
      },
      productForm.id ? "แก้ไขสินค้าเรียบร้อย" : "สร้างสินค้าเรียบร้อย",
    );
  }

  function editProduct(p: Product) {
    setProductForm({
      id: p.id,
      category_id: String(p.category_id),
      name: p.name ?? "",
      slug: p.slug ?? "",
      price: p.price ?? 0,
      stock: p.stock ?? 0,
      description: p.description ?? "",
      image_url: p.image_url ?? "",
      highlights: splitHighlights(p.highlights ?? ""),
      fulfillment_type: (p.fulfillment_type || "digital_stock") as SaleType,
      sort_order: p.sort_order ?? 0,
      is_featured: Boolean(p.is_featured),
      is_unlimited_stock: Boolean(p.is_unlimited_stock),
      badge: p.badge ?? "",
      sku: p.sku ?? "",
      min_order_qty: p.min_order_qty != null ? String(p.min_order_qty) : "",
      max_order_qty: p.max_order_qty != null ? String(p.max_order_qty) : "",
      use_options: Array.isArray(p.product_options) && p.product_options.length > 0,
      product_options: parseProductOptions(p.product_options),
      farm_form_fields: parseFormFields(p.farm_form_fields),
      gallery_images: normalizeGalleryImages(p.gallery_images),
    });
    setProductDialogOpen(true);
  }

  function openProductCreate() {
    setProductForm(EMPTY_PRODUCT);
    setProductDialogOpen(true);
  }

  function openCategoryCreate() {
    setCategoryForm(EMPTY_CATEGORY);
    setCategoryDialogOpen(true);
  }

  return (
    <Tabs defaultValue="products">
      <TabsList>
        <TabsTrigger value="products">สินค้า ({products.length})</TabsTrigger>
        <TabsTrigger value="categories">หมวดหมู่ ({categories.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="products" className="pt-4">
        <>
          <Card className="gap-0 py-0">
            <CardHeader className="gap-2 border-b px-4 py-3">
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="ค้นหาสินค้า…"
                  value={filter.search}
                  onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
                  className="h-8 w-full sm:w-52"
                />
                <NativeSelect
                  size="sm"
                  value={filter.categoryId}
                  onChange={(e) => setFilter((f) => ({ ...f, categoryId: e.target.value }))}
                >
                  <NativeSelectOption value="all">ทุกหมวดหมู่</NativeSelectOption>
                  {categories.map((c) => (
                    <NativeSelectOption key={c.id} value={String(c.id)}>
                      {c.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <NativeSelect
                  size="sm"
                  value={filter.hidden}
                  onChange={(e) => setFilter((f) => ({ ...f, hidden: e.target.value }))}
                >
                  <NativeSelectOption value="all">ทุกสถานะ</NativeSelectOption>
                  <NativeSelectOption value="visible">แสดงอยู่</NativeSelectOption>
                  <NativeSelectOption value="hidden">ซ่อนอยู่</NativeSelectOption>
                </NativeSelect>
                <Button size="sm" className="ml-auto" onClick={openProductCreate} disabled={busy}>
                  <Plus /> เพิ่มสินค้า
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[34rem] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>สินค้า</TableHead>
                      <TableHead>หมวดหมู่</TableHead>
                      <TableHead className="text-right">ราคา</TableHead>
                      <TableHead className="text-right">สต็อก</TableHead>
                      <TableHead>สถานะ</TableHead>
                      <TableHead className="text-right">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleProducts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          ไม่พบสินค้า
                        </TableCell>
                      </TableRow>
                    )}
                    {visibleProducts.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="max-w-52 truncate font-medium text-sm">{p.name}</div>
                          <div className="max-w-52 truncate text-muted-foreground text-xs">{p.slug}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.category_name ?? categoryById.get(p.category_id)?.name ?? "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(p.price)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.is_unlimited_stock ? "∞" : formatNumber(p.stock)}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () => adminApi.put(`/products/${p.id}/hidden`, { is_hidden: !p.is_hidden }),
                                "อัปเดตการแสดงผลเรียบร้อย",
                              )
                            }
                          >
                            <Badge variant={p.is_hidden ? "outline" : "secondary"}>
                              {p.is_hidden ? "ซ่อน" : "แสดง"}
                            </Badge>
                          </button>
                          {p.is_featured && (
                            <Badge variant="default" className="ml-1">
                              เด่น
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon-xs" disabled={busy} onClick={() => editProduct(p)}>
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              disabled={busy}
                              onClick={() =>
                                run(() => adminApi.post(`/products/${p.id}/duplicate`), "ทำสำเนาสินค้าเรียบร้อย")
                              }
                            >
                              <Copy />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              disabled={busy}
                              onClick={() => run(() => adminApi.delete(`/products/${p.id}`), "ลบสินค้าเรียบร้อย")}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <FormDialog
            open={productDialogOpen}
            onOpenChange={setProductDialogOpen}
            title={productForm.id ? `แก้ไขสินค้า #${productForm.id}` : "เพิ่มสินค้าใหม่"}
            size="xl"
            footer={
              <>
                <Button size="sm" variant="outline" onClick={() => setProductDialogOpen(false)} disabled={busy}>
                  ยกเลิก
                </Button>
                <Button size="sm" onClick={saveProduct} disabled={busy}>
                  {productForm.id ? "บันทึก" : "เพิ่มสินค้า"}
                </Button>
              </>
            }
          >
            <ProductForm form={productForm} setForm={setProductForm} categories={categories} disabled={busy} />
          </FormDialog>
        </>
      </TabsContent>

      <TabsContent value="categories" className="pt-4">
        <>
          <Card className="gap-0 py-0">
            <CardHeader className="flex-row items-center justify-between border-b px-4 py-3">
              <CardTitle className="text-base">หมวดหมู่ ({categories.length})</CardTitle>
              <Button size="sm" onClick={openCategoryCreate} disabled={busy}>
                <Plus /> เพิ่มหมวดหมู่
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>หมวดหมู่</TableHead>
                    <TableHead>หมวดแม่</TableHead>
                    <TableHead>ลำดับ</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        ยังไม่มีหมวดหมู่
                      </TableCell>
                    </TableRow>
                  )}
                  {categories.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{c.name}</div>
                        <div className="text-muted-foreground text-xs">{c.slug}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.parent_id ? (categoryById.get(c.parent_id)?.name ?? `#${c.parent_id}`) : "-"}
                      </TableCell>
                      <TableCell className="tabular-nums">{c.sort_order}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => adminApi.put(`/categories/${c.id}/hidden`, { is_hidden: !c.is_hidden }),
                              "อัปเดตการแสดงผลเรียบร้อย",
                            )
                          }
                        >
                          <Badge variant={c.is_hidden ? "outline" : "secondary"}>{c.is_hidden ? "ซ่อน" : "แสดง"}</Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={busy}
                            onClick={() => {
                              setCategoryForm({
                                id: c.id,
                                name: c.name ?? "",
                                slug: c.slug ?? "",
                                image_url: c.image_url ?? "",
                                description: c.description ?? "",
                                parent_id: c.parent_id ? String(c.parent_id) : "",
                                sort_order: c.sort_order ?? 0,
                                icon: c.icon ?? "",
                              });
                              setCategoryDialogOpen(true);
                            }}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={busy}
                            onClick={() => run(() => adminApi.delete(`/categories/${c.id}`), "ลบหมวดหมู่เรียบร้อย")}
                          >
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
            open={categoryDialogOpen}
            onOpenChange={setCategoryDialogOpen}
            title={categoryForm.id ? `แก้ไขหมวดหมู่ #${categoryForm.id}` : "เพิ่มหมวดหมู่"}
            size="lg"
            footer={
              <>
                <Button size="sm" variant="outline" onClick={() => setCategoryDialogOpen(false)} disabled={busy}>
                  ยกเลิก
                </Button>
                <Button size="sm" onClick={saveCategory} disabled={busy}>
                  {categoryForm.id ? "บันทึก" : "เพิ่มหมวดหมู่"}
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              <Field label="ชื่อหมวดหมู่">
                <Input
                  value={categoryForm.name}
                  onChange={(e) =>
                    setCategoryForm((f) => ({ ...f, name: e.target.value, slug: f.slug || makeSlug(e.target.value) }))
                  }
                  disabled={busy}
                />
              </Field>
              <Field label="Slug">
                <Input
                  value={categoryForm.slug}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, slug: e.target.value }))}
                  disabled={busy}
                />
              </Field>
              <Field label="หมวดแม่">
                <NativeSelect
                  value={categoryForm.parent_id}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, parent_id: e.target.value }))}
                  disabled={busy}
                  className="w-full"
                >
                  <NativeSelectOption value="">ไม่มี (หมวดหลัก)</NativeSelectOption>
                  {categories
                    .filter((c) => c.id !== categoryForm.id)
                    .map((c) => (
                      <NativeSelectOption key={c.id} value={String(c.id)}>
                        {c.name}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </Field>
              <ImageUploadCropper
                label="รูปภาพหมวดหมู่"
                value={categoryForm.image_url}
                onChange={(url) => setCategoryForm((f) => ({ ...f, image_url: url }))}
                aspectRatio={16 / 10}
                disabled={busy}
              />
              <Field label="ไอคอน">
                <Input
                  value={categoryForm.icon}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, icon: e.target.value }))}
                  disabled={busy}
                />
              </Field>
              <Field label="คำอธิบาย">
                <Textarea
                  rows={2}
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, description: e.target.value }))}
                  disabled={busy}
                />
              </Field>
              <Field label="ลำดับการแสดง">
                <Input
                  type="number"
                  value={categoryForm.sort_order}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                  disabled={busy}
                />
              </Field>
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
