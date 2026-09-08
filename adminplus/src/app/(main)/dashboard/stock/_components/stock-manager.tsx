"use client";

import { useRef, useState } from "react";

import { Download, Plus, Trash2, Upload } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";
import { formatDateTime, formatNumber } from "@/lib/adminplus/format";

import { LowStockManager } from "./low-stock-panel";
import { MysteryBoxManager } from "./mystery-box-manager";
import { OptionBindingsManager } from "./option-bindings-manager";

export type StockProduct = {
  id: number;
  name: string;
  stock: number;
  is_unlimited_stock: boolean;
  low_stock_threshold?: number | null;
  fulfillment_type: string;
  category_name?: string | null;
  product_options?: unknown;
};

export type StockPool = {
  id: number;
  name: string;
  kind: string;
  quantity_remaining: number | null;
  is_active: boolean;
  created_at?: string;
};

type StockItem = {
  id: number;
  payload: string;
  status: string;
  created_at: string;
  used_at?: string | null;
};

type StockSummary = { total?: number; available?: number; used?: number; [key: string]: unknown };

/** Splits the textarea into one stock line per row, same as AdminV3's splitStockLines. */
function splitStockLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function StockManager({ initialProducts, initialPools }: { initialProducts: StockProduct[]; initialPools: StockPool[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [pools, setPools] = useState(initialPools);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [poolDialogOpen, setPoolDialogOpen] = useState(false);
  const [poolItemsDialogOpen, setPoolItemsDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Product stock
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productItems, setProductItems] = useState<StockItem[]>([]);
  const [productSummary, setProductSummary] = useState<StockSummary | null>(null);
  const [stockText, setStockText] = useState("");
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [threshold, setThreshold] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);
  const [exportOptions, setExportOptions] = useState({ status: "available", format: "csv", mask: false });

  // Pools
  const [selectedPoolId, setSelectedPoolId] = useState("");
  const [poolItems, setPoolItems] = useState<StockItem[]>([]);
  const [poolSummary, setPoolSummary] = useState<StockSummary | null>(null);
  const [poolText, setPoolText] = useState("");
  const [poolForm, setPoolForm] = useState({ id: null as number | null, name: "", kind: "digital", quantity_remaining: "", is_active: true });

  async function reloadProducts() {
    try {
      const res = await adminApi.get<{ products: StockProduct[] }>("/products");
      setProducts(res.products ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function reloadPools() {
    try {
      const res = await adminApi.get<{ pools: StockPool[] }>("/stock-pools?limit=200&offset=0");
      setPools(res.pools ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function loadProductItems(productId: string, openDialog = false) {
    setSelectedProductId(productId);
    if (openDialog) setStockDialogOpen(true);
    setProductItems([]);
    setProductSummary(null);
    if (!productId) return;
    try {
      const res = await adminApi.get<{ items: StockItem[]; summary: StockSummary }>(`/stock-items?product_id=${productId}&limit=200`);
      setProductItems(res.items ?? []);
      setProductSummary(res.summary ?? null);
      const product = products.find((p) => String(p.id) === productId);
      setThreshold(product?.low_stock_threshold != null ? String(product.low_stock_threshold) : "");
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function loadPoolItems(poolId: string, openDialog = false) {
    setSelectedPoolId(poolId);
    if (openDialog) setPoolItemsDialogOpen(true);
    setPoolItems([]);
    setPoolSummary(null);
    if (!poolId) return;
    try {
      const res = await adminApi.get<{ items: StockItem[]; summary: StockSummary }>(`/stock-pool-items?pool_id=${poolId}&limit=200`);
      setPoolItems(res.items ?? []);
      setPoolSummary(res.summary ?? null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function addProductStock() {
    const items = splitStockLines(stockText);
    if (!selectedProductId) return toast.error("กรุณาเลือกสินค้า");
    if (items.length === 0) return toast.error("กรุณาใส่ข้อมูลสต็อกอย่างน้อย 1 บรรทัด");
    setBusy(true);
    try {
      const res = await adminApi.post<{ result: { inserted: number; duplicates_in_batch: number; duplicates_in_db: number } }>("/stock", {
        product_id: Number(selectedProductId),
        items,
        allow_duplicates: allowDuplicates,
      });
      const r = res.result;
      toast.success(`เพิ่มสต็อก ${r?.inserted ?? 0} รายการ (ซ้ำในไฟล์ ${r?.duplicates_in_batch ?? 0}, ซ้ำในระบบ ${r?.duplicates_in_db ?? 0})`);
      setStockText("");
      await loadProductItems(selectedProductId);
      await reloadProducts();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Sends the file's text to /stock/import rather than reusing the plain /stock
   * endpoint, so the import lands in the audit log as stock.import with its
   * original filename. The route accepts multipart or a JSON `text` field.
   */
  async function importStockFile(file: File) {
    if (!selectedProductId) return toast.error("กรุณาเลือกสินค้า");
    setBusy(true);
    try {
      const text = await file.text();
      if (splitStockLines(text).length === 0) return toast.error("ไฟล์นี้ไม่มีข้อมูลสต็อก");
      const res = await adminApi.post<{ result: { inserted: number; duplicates_in_batch: number; duplicates_in_db: number } }>(
        "/stock/import",
        { product_id: Number(selectedProductId), text, allow_duplicates: allowDuplicates },
      );
      const r = res.result;
      toast.success(
        `นำเข้า ${r?.inserted ?? 0} รายการจาก ${file.name} (ซ้ำในไฟล์ ${r?.duplicates_in_batch ?? 0}, ซ้ำในระบบ ${r?.duplicates_in_db ?? 0})`,
      );
      await loadProductItems(selectedProductId);
      await reloadProducts();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  }

  /**
   * The export endpoint answers with a file body, so pull the text through the
   * proxy and hand the browser a blob — that keeps the filename ours instead of
   * relying on a Content-Disposition header surviving the hop.
   */
  async function exportStock() {
    if (!selectedProductId) return toast.error("กรุณาเลือกสินค้า");
    setBusy(true);
    try {
      const { status, format, mask } = exportOptions;
      const text = await adminApi.getText(
        `/stock/export?product_id=${selectedProductId}&status=${status}&format=${format}&mask=${mask}`,
      );
      if (!text.trim()) {
        toast.error("ไม่มีข้อมูลให้ส่งออกตามเงื่อนไขนี้");
        return;
      }
      const blob = new Blob([text], { type: format === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `stock-export-product-${selectedProductId}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("ส่งออกสต็อกเรียบร้อย");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveThreshold() {
    if (!selectedProductId) return;
    const parsed = Number(threshold);
    if (!Number.isFinite(parsed) || parsed < 0) return toast.error("ค่าแจ้งเตือนสต็อกต่ำไม่ถูกต้อง");
    setBusy(true);
    try {
      await adminApi.patch(`/products/${selectedProductId}/stock-threshold`, { threshold: parsed });
      toast.success("บันทึกค่าแจ้งเตือนสต็อกต่ำเรียบร้อย");
      await reloadProducts();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteStockItem(id: number) {
    setBusy(true);
    try {
      await adminApi.delete(`/stock-items/${id}`);
      toast.success("ลบไอเทมเรียบร้อย");
      await loadProductItems(selectedProductId);
      await reloadProducts();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function openPoolCreate() {
    setPoolForm({ id: null, name: "", kind: "digital", quantity_remaining: "", is_active: true });
    setPoolDialogOpen(true);
  }

  async function savePool() {
    const name = poolForm.name.trim();
    if (!name) return toast.error("กรุณากรอกชื่อ pool");
    const body = {
      name,
      kind: poolForm.kind,
      quantity_remaining: poolForm.quantity_remaining === "" ? null : Number(poolForm.quantity_remaining),
      is_active: poolForm.is_active,
    };
    setBusy(true);
    try {
      if (poolForm.id) await adminApi.put(`/stock-pools/${poolForm.id}`, body);
      else await adminApi.post("/stock-pools", body);
      toast.success(poolForm.id ? "แก้ไข pool เรียบร้อย" : "สร้าง pool เรียบร้อย");
      setPoolForm({ id: null, name: "", kind: "digital", quantity_remaining: "", is_active: true });
      setPoolDialogOpen(false);
      await reloadPools();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deletePool(id: number) {
    setBusy(true);
    try {
      await adminApi.delete(`/stock-pools/${id}`);
      toast.success("ลบ pool เรียบร้อย");
      if (selectedPoolId === String(id)) setSelectedPoolId("");
      await reloadPools();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function addPoolItems() {
    const items = splitStockLines(poolText);
    if (!selectedPoolId) return toast.error("กรุณาเลือก pool");
    if (items.length === 0) return toast.error("กรุณาใส่ข้อมูลอย่างน้อย 1 บรรทัด");
    setBusy(true);
    try {
      await adminApi.post("/stock-pool-items", { pool_id: Number(selectedPoolId), items, allow_duplicates: false });
      toast.success("เพิ่มไอเทมเข้า pool เรียบร้อย");
      setPoolText("");
      await loadPoolItems(selectedPoolId);
      await reloadPools();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deletePoolItem(id: number) {
    setBusy(true);
    try {
      await adminApi.delete(`/stock-pool-items/${id}`);
      toast.success("ลบไอเทมเรียบร้อย");
      await loadPoolItems(selectedPoolId);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tabs defaultValue="products">
      <TabsList>
        <TabsTrigger value="products">สต็อกสินค้า</TabsTrigger>
        <TabsTrigger value="pools">Stock pools</TabsTrigger>
        <TabsTrigger value="mystery">กล่องสุ่ม</TabsTrigger>
        <TabsTrigger value="bindings">ผูกตัวเลือก</TabsTrigger>
        <TabsTrigger value="low">สต็อกต่ำ</TabsTrigger>
      </TabsList>

      <TabsContent value="products" className="pt-4">
        <>
          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-4 py-3">
              <CardTitle className="text-base">สต็อกคงเหลือรายสินค้า</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[30rem] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>สินค้า</TableHead>
                      <TableHead>ประเภท</TableHead>
                      <TableHead className="text-right">คงเหลือ</TableHead>
                      <TableHead className="text-right">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          ยังไม่มีสินค้า
                        </TableCell>
                      </TableRow>
                    )}
                    {products.map((p) => (
                      <TableRow key={p.id} className={selectedProductId === String(p.id) ? "bg-muted" : undefined}>
                        <TableCell>
                          <div className="max-w-56 truncate text-sm">{p.name}</div>
                          <div className="text-muted-foreground text-xs">{p.category_name}</div>
                        </TableCell>
                        <TableCell className="text-xs">{p.fulfillment_type}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.is_unlimited_stock ? (
                            "∞"
                          ) : (
                            <span className={p.low_stock_threshold != null && p.stock <= p.low_stock_threshold ? "text-destructive" : undefined}>
                              {formatNumber(p.stock)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="xs" variant="outline" onClick={() => loadProductItems(String(p.id), true)} disabled={busy}>
                            จัดการสต็อก
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <FormDialog
            open={stockDialogOpen}
            onOpenChange={setStockDialogOpen}
            title="จัดการสต็อกสินค้า"
            description={products.find((p) => String(p.id) === selectedProductId)?.name}
            size="xl"
            footer={
              <Button size="sm" variant="outline" onClick={() => setStockDialogOpen(false)} disabled={busy}>
                ปิด
              </Button>
            }
          >
            <div className="flex flex-col gap-3">
              <Field label="สินค้า">
                <NativeSelect value={selectedProductId} onChange={(e) => loadProductItems(e.target.value)} disabled={busy} className="w-full">
                  <NativeSelectOption value="">เลือกสินค้า…</NativeSelectOption>
                  {products.map((p) => (
                    <NativeSelectOption key={p.id} value={String(p.id)}>
                      {p.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              {productSummary && (
                <div className="flex gap-2 text-xs">
                  <Badge variant="secondary">ทั้งหมด {formatNumber(productSummary.total)}</Badge>
                  <Badge variant="secondary">พร้อมขาย {formatNumber(productSummary.available)}</Badge>
                  <Badge variant="outline">ใช้แล้ว {formatNumber(productSummary.used)}</Badge>
                </div>
              )}

              <Field label="ข้อมูลสต็อก (บรรทัดละ 1 รายการ)">
                <Textarea
                  rows={5}
                  className="font-mono text-xs"
                  value={stockText}
                  onChange={(e) => setStockText(e.target.value)}
                  disabled={busy || !selectedProductId}
                  placeholder={"user1:pass1\nuser2:pass2"}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={allowDuplicates} onCheckedChange={(c) => setAllowDuplicates(Boolean(c))} />
                อนุญาตข้อมูลซ้ำ
              </label>
              <Button size="sm" onClick={addProductStock} disabled={busy || !selectedProductId || !stockText.trim()}>
                เพิ่มสต็อก ({splitStockLines(stockText).length} รายการ)
              </Button>

              <div className="grid gap-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".txt,.csv,text/plain,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importStockFile(file);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !selectedProductId}
                    onClick={() => importFileRef.current?.click()}
                  >
                    <Upload /> นำเข้าจากไฟล์
                  </Button>
                  <span className="text-muted-foreground text-xs">รองรับ .txt / .csv บรรทัดละ 1 รายการ</span>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <Field label="สถานะที่ส่งออก">
                    <NativeSelect
                      value={exportOptions.status}
                      onChange={(e) => setExportOptions((prev) => ({ ...prev, status: e.target.value }))}
                      disabled={busy}
                    >
                      <NativeSelectOption value="available">พร้อมขาย</NativeSelectOption>
                      <NativeSelectOption value="used">ใช้แล้ว</NativeSelectOption>
                      <NativeSelectOption value="all">ทั้งหมด</NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <Field label="รูปแบบไฟล์">
                    <NativeSelect
                      value={exportOptions.format}
                      onChange={(e) => setExportOptions((prev) => ({ ...prev, format: e.target.value }))}
                      disabled={busy}
                    >
                      <NativeSelectOption value="csv">CSV</NativeSelectOption>
                      <NativeSelectOption value="txt">TXT</NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <Button size="sm" variant="outline" onClick={exportStock} disabled={busy || !selectedProductId}>
                    <Download /> ส่งออก
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={exportOptions.mask}
                    onCheckedChange={(c) => setExportOptions((prev) => ({ ...prev, mask: Boolean(c) }))}
                  />
                  ปิดบังข้อมูลบางส่วนในไฟล์ที่ส่งออก
                </label>
              </div>

              {selectedProductId && (
                <>
                  <Field label="แจ้งเตือนเมื่อสต็อกต่ำกว่า">
                    <div className="flex gap-2">
                      <Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} disabled={busy} />
                      <Button size="sm" variant="outline" onClick={saveThreshold} disabled={busy}>
                        บันทึก
                      </Button>
                    </div>
                  </Field>

                  <div>
                    <p className="mb-1 text-muted-foreground text-xs">ไอเทมในสต็อก ({productItems.length})</p>
                    <div className="max-h-56 overflow-y-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ข้อมูล</TableHead>
                            <TableHead>สถานะ</TableHead>
                            <TableHead className="text-right">ลบ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {productItems.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                                ไม่มีไอเทม
                              </TableCell>
                            </TableRow>
                          )}
                          {productItems.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="max-w-40 truncate font-mono text-xs">{item.payload}</TableCell>
                              <TableCell>
                                <Badge variant={item.status === "available" ? "secondary" : "outline"}>{item.status}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="icon-xs" onClick={() => deleteStockItem(item.id)} disabled={busy}>
                                  <Trash2 />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </FormDialog>
        </>
      </TabsContent>

      <TabsContent value="pools" className="pt-4">
        <>
          <Card className="gap-0 py-0">
            <CardHeader className="flex-row items-center justify-between border-b px-4 py-3">
              <CardTitle className="text-base">Stock pools ({pools.length})</CardTitle>
              <Button size="sm" onClick={openPoolCreate} disabled={busy}>
                <Plus /> สร้าง pool
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pool</TableHead>
                    <TableHead>ชนิด</TableHead>
                    <TableHead className="text-right">คงเหลือ</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pools.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        ยังไม่มี pool
                      </TableCell>
                    </TableRow>
                  )}
                  {pools.map((pool) => (
                    <TableRow key={pool.id} className={selectedPoolId === String(pool.id) ? "bg-muted" : undefined}>
                      <TableCell className="text-sm">{pool.name}</TableCell>
                      <TableCell className="text-xs">{pool.kind}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pool.quantity_remaining == null ? "-" : formatNumber(pool.quantity_remaining)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={pool.is_active ? "secondary" : "outline"}>{pool.is_active ? "เปิด" : "ปิด"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="xs" variant="outline" onClick={() => loadPoolItems(String(pool.id), true)} disabled={busy}>
                            ไอเทม
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              setPoolForm({
                                id: pool.id,
                                name: pool.name,
                                kind: pool.kind,
                                quantity_remaining: pool.quantity_remaining == null ? "" : String(pool.quantity_remaining),
                                is_active: pool.is_active,
                              });
                              setPoolDialogOpen(true);
                            }}
                            disabled={busy}
                          >
                            แก้ไข
                          </Button>
                          <Button variant="ghost" size="icon-xs" onClick={() => deletePool(pool.id)} disabled={busy}>
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
            open={poolDialogOpen}
            onOpenChange={setPoolDialogOpen}
            title={poolForm.id ? `แก้ไข pool #${poolForm.id}` : "สร้าง pool"}
            size="lg"
            footer={
              <>
                <Button size="sm" variant="outline" onClick={() => setPoolDialogOpen(false)} disabled={busy}>
                  ยกเลิก
                </Button>
                <Button size="sm" onClick={savePool} disabled={busy}>
                  {poolForm.id ? "บันทึก" : "สร้าง pool"}
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
                <Field label="ชื่อ pool">
                  <Input value={poolForm.name} onChange={(e) => setPoolForm((f) => ({ ...f, name: e.target.value }))} disabled={busy} />
                </Field>
                <Field label="ชนิด">
                  <NativeSelect value={poolForm.kind} onChange={(e) => setPoolForm((f) => ({ ...f, kind: e.target.value }))} disabled={busy} className="w-full">
                    <NativeSelectOption value="digital">digital</NativeSelectOption>
                    <NativeSelectOption value="quantity">quantity</NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field label="จำนวนคงเหลือ (สำหรับชนิด quantity)">
                  <Input
                    type="number"
                    value={poolForm.quantity_remaining}
                    onChange={(e) => setPoolForm((f) => ({ ...f, quantity_remaining: e.target.value }))}
                    disabled={busy}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={poolForm.is_active} onCheckedChange={(c) => setPoolForm((f) => ({ ...f, is_active: Boolean(c) }))} />
                  เปิดใช้งาน
                </label>
            </div>
          </FormDialog>

          <FormDialog
            open={poolItemsDialogOpen}
            onOpenChange={setPoolItemsDialogOpen}
            title={`ไอเทมใน pool (${poolItems.length})`}
            description={pools.find((pool) => String(pool.id) === selectedPoolId)?.name}
            size="xl"
            footer={
              <Button size="sm" variant="outline" onClick={() => setPoolItemsDialogOpen(false)} disabled={busy}>
                ปิด
              </Button>
            }
          >
                <div className="flex flex-col gap-3">
                  {poolSummary && (
                    <div className="flex gap-2 text-xs">
                      <Badge variant="secondary">ทั้งหมด {formatNumber(poolSummary.total)}</Badge>
                      <Badge variant="secondary">พร้อมใช้ {formatNumber(poolSummary.available)}</Badge>
                    </div>
                  )}
                  <Textarea
                    rows={4}
                    className="font-mono text-xs"
                    value={poolText}
                    onChange={(e) => setPoolText(e.target.value)}
                    disabled={busy}
                    placeholder="บรรทัดละ 1 รายการ"
                  />
                  <Button size="sm" onClick={addPoolItems} disabled={busy || !poolText.trim()}>
                    เพิ่มไอเทม ({splitStockLines(poolText).length})
                  </Button>
                  <div className="max-h-56 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ข้อมูล</TableHead>
                          <TableHead>สถานะ</TableHead>
                          <TableHead>เพิ่มเมื่อ</TableHead>
                          <TableHead className="text-right">ลบ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {poolItems.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                              ไม่มีไอเทม
                            </TableCell>
                          </TableRow>
                        )}
                        {poolItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="max-w-32 truncate font-mono text-xs">{item.payload}</TableCell>
                            <TableCell>
                              <Badge variant={item.status === "available" ? "secondary" : "outline"}>{item.status}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">{formatDateTime(item.created_at)}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon-xs" onClick={() => deletePoolItem(item.id)} disabled={busy}>
                                <Trash2 />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
          </FormDialog>
        </>
      </TabsContent>

      <TabsContent value="mystery" className="pt-4">
        <MysteryBoxManager products={products} />
      </TabsContent>

      <TabsContent value="bindings" className="pt-4">
        <OptionBindingsManager products={products} pools={pools} />
      </TabsContent>

      <TabsContent value="low" className="pt-4">
        <LowStockManager onStockChanged={reloadProducts} />
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
