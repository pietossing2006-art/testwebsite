"use client";

import { useEffect, useState } from "react";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";
import { formatNumber } from "@/lib/adminplus/format";

/**
 * Shape of /api/admin/stock/low-stock. The server only reports visible,
 * limited-stock digital products that have fallen to or below their threshold
 * (defaulting to 3 when none is set), so an empty list genuinely means nothing
 * needs restocking.
 */
type LowStockProduct = {
  id: number;
  name: string;
  slug: string;
  price: number;
  stock: number;
  low_stock_threshold: number;
  category_name: string | null;
  is_out_of_stock: boolean;
};

export function LowStockManager({ onStockChanged }: { onStockChanged?: () => void }) {
  const [rows, setRows] = useState<LowStockProduct[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.get<{ products: LowStockProduct[] }>("/stock/low-stock");
      const products = res.products ?? [];
      setRows(products);
      setDrafts(Object.fromEntries(products.map((p) => [p.id, String(p.low_stock_threshold)])));
    } catch (err) {
      toast.error(getErrorMessage(err, "โหลดรายการสต็อกต่ำไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveThreshold(product: LowStockProduct) {
    const value = Number(drafts[product.id]);
    if (!Number.isFinite(value) || value < 0) return toast.error("ค่าแจ้งเตือนต้องเป็นตัวเลขไม่ติดลบ");
    setBusy(true);
    try {
      await adminApi.patch(`/products/${product.id}/stock-threshold`, { threshold: value });
      toast.success(`ตั้งค่าแจ้งเตือนของ ${product.name} เป็น ${value} แล้ว`);
      await load();
      onStockChanged?.();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const outOfStock = rows.filter((r) => r.is_out_of_stock).length;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">สินค้าที่ต้องเติมสต็อก</CardTitle>
          {rows.length > 0 && (
            <>
              <Badge variant="outline">{formatNumber(rows.length)} รายการ</Badge>
              {outOfStock > 0 && <Badge variant="destructive">หมดแล้ว {formatNumber(outOfStock)}</Badge>}
            </>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading || busy}>
          <RefreshCw /> รีเฟรช
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="px-4 py-10 text-center text-muted-foreground text-sm">กำลังโหลด...</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-muted-foreground text-sm">
            ไม่มีสินค้าที่สต็อกต่ำกว่าค่าแจ้งเตือนตอนนี้
          </div>
        ) : (
          <div className="max-h-[30rem] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>สินค้า</TableHead>
                  <TableHead className="text-right">คงเหลือ</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>แจ้งเตือนเมื่อต่ำกว่า</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="max-w-56 truncate font-medium text-sm">{row.name}</div>
                      <div className="max-w-56 truncate text-muted-foreground text-xs">{row.category_name ?? "-"}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={row.is_out_of_stock ? "font-semibold text-destructive" : "text-destructive"}>
                        {formatNumber(row.stock)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.is_out_of_stock ? (
                        <Badge variant="destructive">
                          <AlertTriangle /> ของหมด
                        </Badge>
                      ) : (
                        <Badge variant="outline">ใกล้หมด</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          className="w-24"
                          value={drafts[row.id] ?? ""}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                          disabled={busy}
                        />
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={busy || drafts[row.id] === String(row.low_stock_threshold)}
                          onClick={() => saveThreshold(row)}
                        >
                          บันทึก
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
