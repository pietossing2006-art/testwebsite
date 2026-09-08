"use client";

import { useEffect, useMemo, useState } from "react";

import { Link2, Unlink } from "lucide-react";
import { toast } from "sonner";

import { parseProductOptions } from "@/components/adminplus/product-field-editors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";
import { formatNumber } from "@/lib/adminplus/format";

import type { StockPool, StockProduct } from "./stock-manager";

export type OptionBinding = {
  id: number;
  product_id: number;
  product_option_id: string | null;
  pool_id: number;
  pool_name: string;
  pool_kind: string;
  quantity_remaining: number | null;
  is_active: boolean;
};

/**
 * A binding row is either one product option or the product as a whole. The server
 * stores the latter as product_option_id = NULL, which is also the row every
 * non-option product uses, so it always gets a slot here.
 */
type Slot = { optionId: string | null; label: string; sublabel: string };

export function OptionBindingsManager({ products, pools }: { products: StockProduct[]; pools: StockPool[] }) {
  const [productId, setProductId] = useState("");
  const [bindings, setBindings] = useState<OptionBinding[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const product = products.find((p) => String(p.id) === productId);

  const slots = useMemo<Slot[]>(() => {
    if (!product) return [];
    const options = parseProductOptions(product.product_options).filter((o) => o.id);
    return [
      {
        optionId: null,
        label: "ทั้งสินค้า (ไม่แยกตัวเลือก)",
        sublabel: options.length > 0 ? "ใช้เมื่อออเดอร์ไม่ได้ระบุตัวเลือก" : "สินค้านี้ไม่มีตัวเลือกย่อย",
      },
      ...options.map((o) => ({ optionId: o.id, label: o.label || o.id, sublabel: `รหัสตัวเลือก: ${o.id}` })),
    ];
  }, [product]);

  const bindingFor = useMemo(() => {
    const map = new Map<string, OptionBinding>();
    for (const b of bindings) map.set(b.product_option_id ?? "", b);
    return map;
  }, [bindings]);

  async function load(id: string) {
    setProductId(id);
    setBindings([]);
    if (!id) return;
    setLoading(true);
    try {
      const res = await adminApi.get<{ bindings: OptionBinding[] }>(`/product-option-stock-bindings?product_id=${id}`);
      setBindings(res.bindings ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, "โหลดการผูกสต็อกไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (productId) load(productId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      await load(productId);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function bind(slot: Slot, poolId: string) {
    if (!poolId) {
      run(
        () =>
          adminApi.delete("/product-option-stock-bindings", {
            product_id: Number(productId),
            product_option_id: slot.optionId,
          }),
        `ยกเลิกการผูกสต็อกของ "${slot.label}" แล้ว`,
      );
      return;
    }
    run(
      () =>
        adminApi.post("/product-option-stock-bindings", {
          product_id: Number(productId),
          product_option_id: slot.optionId,
          pool_id: Number(poolId),
        }),
      `ผูก "${slot.label}" เข้ากับ pool แล้ว`,
    );
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b px-4 py-3">
        <CardTitle className="text-base">ผูกตัวเลือกสินค้ากับ stock pool</CardTitle>
        <NativeSelect value={productId} onChange={(e) => load(e.target.value)} className="w-64" aria-label="เลือกสินค้า">
          <NativeSelectOption value="">เลือกสินค้า...</NativeSelectOption>
          {products.map((p) => (
            <NativeSelectOption key={p.id} value={String(p.id)}>
              #{p.id} {p.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </CardHeader>
      <CardContent className="p-0">
        {pools.length === 0 ? (
          <div className="px-4 py-10 text-center text-muted-foreground text-sm">
            ยังไม่มี stock pool — สร้าง pool ในแท็บ Stock pools ก่อน แล้วค่อยกลับมาผูก
          </div>
        ) : !productId ? (
          <div className="px-4 py-10 text-center text-muted-foreground text-sm">
            เลือกสินค้าเพื่อดูว่าตัวเลือกแต่ละอันดึงสต็อกจาก pool ไหน
          </div>
        ) : loading ? (
          <div className="px-4 py-10 text-center text-muted-foreground text-sm">กำลังโหลด...</div>
        ) : (
          <div className="max-h-[30rem] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ตัวเลือก</TableHead>
                  <TableHead>Pool ที่ผูกไว้</TableHead>
                  <TableHead className="text-right">คงเหลือใน pool</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slots.map((slot) => {
                  const binding = bindingFor.get(slot.optionId ?? "");
                  return (
                    <TableRow key={slot.optionId ?? "__default"}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {binding ? (
                            <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <Unlink className="size-3.5 shrink-0 text-muted-foreground/50" />
                          )}
                          <div className="min-w-0">
                            <div className="max-w-56 truncate font-medium text-sm">{slot.label}</div>
                            <div className="max-w-56 truncate text-muted-foreground text-xs">{slot.sublabel}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <NativeSelect
                          value={binding ? String(binding.pool_id) : ""}
                          onChange={(e) => bind(slot, e.target.value)}
                          disabled={busy}
                          className="w-56"
                          aria-label={`pool ของ ${slot.label}`}
                        >
                          <NativeSelectOption value="">ไม่ผูก pool</NativeSelectOption>
                          {pools.map((pool) => (
                            <NativeSelectOption key={pool.id} value={String(pool.id)}>
                              {pool.name}
                              {pool.is_active ? "" : " (ปิดอยู่)"}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {binding ? (binding.quantity_remaining == null ? "∞" : formatNumber(binding.quantity_remaining)) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {binding ? (
                          <Button size="xs" variant="outline" disabled={busy} onClick={() => bind(slot, "")}>
                            ยกเลิกการผูก
                          </Button>
                        ) : (
                          <Badge variant="outline">ยังไม่ผูก</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {productId && slots.length === 1 && (
        <div className="border-t px-4 py-2 text-muted-foreground text-xs">
          สินค้านี้ยังไม่มีตัวเลือกย่อย — เพิ่มตัวเลือกในหน้าแคตตาล็อกแล้วจะมาผูก pool แยกรายตัวเลือกได้
        </div>
      )}
    </Card>
  );
}
