"use client";

import { useMemo, useState } from "react";

import { Dices, Layers, Pencil, Plus, Trash2 } from "lucide-react";
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
import { formatDateTime, formatNumber } from "@/lib/adminplus/format";

import type { StockProduct } from "./stock-manager";

/**
 * The three ways a prize can be backed, matching the prize_kind check in
 * server/db/catalog/mysteryBox.js:
 *  - product        the box holds its own stock, and the quota is recounted from those items
 *  - linked_product the prize draws from another product via its stock pool binding
 *  - salt           a consolation prize with nothing behind it, so the quota stands alone
 */
const PRIZE_KINDS = [
  {
    value: "product",
    label: "รางวัลมีสต็อกในกล่อง",
    hint: "แนบรายการสต็อกได้เลย โควตาจะนับจากจำนวนสต็อกที่เหลือให้อัตโนมัติ",
  },
  { value: "linked_product", label: "ผูกสต็อกจากสินค้าอื่น", hint: "รางวัลจะตัดจากสต็อกของสินค้าที่เลือก" },
  { value: "salt", label: "รางวัลเกลือ (ไม่มีของ)", hint: "ไม่มีสต็อกจริง ใช้โควตาคงเหลือที่กรอกไว้" },
] as const;

type PrizeKind = (typeof PRIZE_KINDS)[number]["value"];

export type MysteryPrize = {
  id: number;
  box_product_id: number;
  prize_kind: string;
  prize_product_id: number | null;
  prize_name: string | null;
  prize_image_url: string | null;
  prize_product_name?: string | null;
  prize_available_stock?: number;
  weight: number;
  remaining: number;
  is_active: boolean;
  effective_weight?: number;
  probability_percent?: number;
};

type PrizeStockItem = {
  id: number;
  status: string;
  payload: string;
  image_url: string | null;
  created_at?: string;
  reserved_at?: string | null;
  delivered_at?: string | null;
};

type SimulationRow = {
  prize_id: number;
  prize_name: string | null;
  prize_product_name: string | null;
  prize_kind: string;
  weight: number;
  remaining: number;
  available_stock: number;
  hits: number;
  probability_percent: number;
  expected_hits: number;
};

type Simulation = { qty_per_trial: number; trials: number; total_draws: number; results: SimulationRow[] };

const EMPTY_PRIZE = {
  id: null as number | null,
  prize_kind: "product" as PrizeKind,
  prize_name: "",
  prize_image_url: "",
  prize_product_id: "",
  weight: "1",
  remaining: "0",
  is_active: true,
};

type PrizeFormState = typeof EMPTY_PRIZE;

function splitStockLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** A prize with no stock behind it can never be drawn, so spell out why the odds are zero. */
function drawState(prize: MysteryPrize) {
  if (!prize.is_active) return { ok: false, reason: "ปิดใช้งาน" };
  if (Number(prize.weight) <= 0) return { ok: false, reason: "น้ำหนัก 0" };
  if (Number(prize.remaining) <= 0) return { ok: false, reason: "โควตาหมด" };
  if (prize.prize_kind !== "salt" && Number(prize.prize_available_stock ?? 0) <= 0) {
    return { ok: false, reason: "ไม่มีสต็อก" };
  }
  return { ok: true, reason: "" };
}

function prizeLabel(prize: { prize_name?: string | null; prize_product_name?: string | null; prize_id?: number; id?: number }) {
  return prize.prize_name || prize.prize_product_name || `รางวัล #${prize.prize_id ?? prize.id}`;
}

export function MysteryBoxManager({ products }: { products: StockProduct[] }) {
  const boxProducts = useMemo(() => products.filter((p) => p.fulfillment_type === "mystery_box"), [products]);
  const prizeSourceProducts = useMemo(() => products.filter((p) => p.fulfillment_type !== "mystery_box"), [products]);

  const [boxProductId, setBoxProductId] = useState("");
  const [prizes, setPrizes] = useState<MysteryPrize[]>([]);
  const [busy, setBusy] = useState(false);

  const [prizeDialogOpen, setPrizeDialogOpen] = useState(false);
  const [prizeForm, setPrizeForm] = useState<PrizeFormState>(EMPTY_PRIZE);
  const [prizeStockText, setPrizeStockText] = useState("");

  const [itemsDialogOpen, setItemsDialogOpen] = useState(false);
  const [itemsPrize, setItemsPrize] = useState<MysteryPrize | null>(null);
  const [items, setItems] = useState<PrizeStockItem[]>([]);
  const [itemsText, setItemsText] = useState("");

  const [simDialogOpen, setSimDialogOpen] = useState(false);
  const [simInput, setSimInput] = useState({ qty: "1", trials: "5000" });
  const [simulation, setSimulation] = useState<Simulation | null>(null);

  const editing = prizeForm.id != null;
  const totalOdds = prizes.reduce((sum, p) => sum + Number(p.probability_percent ?? 0), 0);

  async function loadPrizes(id: string) {
    setBoxProductId(id);
    setPrizes([]);
    setSimulation(null);
    if (!id) return;
    try {
      const res = await adminApi.get<{ items: MysteryPrize[] }>(`/mystery-box-prizes?box_product_id=${id}&limit=200`);
      setPrizes(res.items ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, "โหลดรายการรางวัลไม่สำเร็จ"));
    }
  }

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      await loadPrizes(boxProductId);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function openCreate() {
    setPrizeForm(EMPTY_PRIZE);
    setPrizeStockText("");
    setPrizeDialogOpen(true);
  }

  function openEdit(prize: MysteryPrize) {
    setPrizeForm({
      id: prize.id,
      prize_kind: (prize.prize_kind as PrizeKind) ?? "product",
      prize_name: prize.prize_name ?? "",
      prize_image_url: prize.prize_image_url ?? "",
      prize_product_id: prize.prize_product_id != null ? String(prize.prize_product_id) : "",
      weight: String(prize.weight ?? 1),
      remaining: String(prize.remaining ?? 0),
      is_active: Boolean(prize.is_active),
    });
    setPrizeStockText("");
    setPrizeDialogOpen(true);
  }

  async function savePrize() {
    const boxId = Number(boxProductId);
    const kind = prizeForm.prize_kind;
    const name = prizeForm.prize_name.trim();
    const weight = Number(prizeForm.weight);
    const remaining = Number(prizeForm.remaining);
    const linkedId = prizeForm.prize_product_id === "" ? null : Number(prizeForm.prize_product_id);
    const stockLines = splitStockLines(prizeStockText);

    if (!Number.isFinite(boxId) || boxId <= 0) return toast.error("เลือกกล่องสุ่มก่อน");
    if (!Number.isFinite(weight) || weight <= 0) return toast.error("น้ำหนักโอกาสต้องมากกว่า 0");
    if (kind === "salt" && !name) return toast.error("รางวัลเกลือต้องตั้งชื่อ");
    if (kind === "linked_product" && (!Number.isFinite(linkedId as number) || (linkedId as number) <= 0)) {
      return toast.error("เลือกสินค้าที่จะผูกสต็อก");
    }
    if (kind !== "product" && (!Number.isFinite(remaining) || remaining < 0)) return toast.error("โควตาคงเหลือไม่ถูกต้อง");
    if (!editing && kind === "product" && stockLines.length < 1) {
      return toast.error("รางวัลที่ถือสต็อกเองต้องใส่สต็อกอย่างน้อย 1 รายการ");
    }

    // A `product` prize is only ever as large as the stock behind it, so seed the quota
    // from the pasted lines rather than trusting the number field.
    const effectiveRemaining = kind === "product" ? Math.max(remaining, stockLines.length) : remaining;

    if (editing) {
      await run(
        () =>
          adminApi.put(`/mystery-box-prizes/${prizeForm.id}`, {
            prize_name: name,
            prize_image_url: prizeForm.prize_image_url || null,
            weight,
            remaining: effectiveRemaining,
            is_active: prizeForm.is_active,
          }),
        "บันทึกรางวัลเรียบร้อย",
      );
      setPrizeDialogOpen(false);
      return;
    }

    await run(async () => {
      const created = await adminApi.post<{ id: number }>("/mystery-box-prizes", {
        box_product_id: boxId,
        prize_kind: kind,
        prize_name: name,
        prize_image_url: prizeForm.prize_image_url || null,
        prize_product_id: kind === "linked_product" ? linkedId : null,
        weight,
        remaining: effectiveRemaining,
        is_active: prizeForm.is_active,
      });
      if (kind === "product" && stockLines.length > 0 && Number(created?.id) > 0) {
        await adminApi.post("/mystery-box-prize-stock", {
          box_product_id: boxId,
          prize_id: created.id,
          items: stockLines,
        });
      }
    }, "เพิ่มรางวัลเรียบร้อย");
    setPrizeDialogOpen(false);
  }

  async function refreshItems(prize: MysteryPrize) {
    const res = await adminApi.get<{ items: PrizeStockItem[] }>(`/mystery-box-prize-stock?prize_id=${prize.id}&limit=200`);
    setItems(res.items ?? []);
  }

  async function openItems(prize: MysteryPrize) {
    setItemsPrize(prize);
    setItems([]);
    setItemsText("");
    setItemsDialogOpen(true);
    try {
      await refreshItems(prize);
    } catch (err) {
      toast.error(getErrorMessage(err, "โหลดสต็อกรางวัลไม่สำเร็จ"));
    }
  }

  /** Every stock write also recounts the prize quota server-side, so reload both. */
  async function runOnItems(fn: () => Promise<unknown>, message: string) {
    if (!itemsPrize) return;
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      await refreshItems(itemsPrize);
      await loadPrizes(boxProductId);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function addItems() {
    if (!itemsPrize) return;
    const lines = splitStockLines(itemsText);
    if (lines.length < 1) return toast.error("ใส่สต็อกอย่างน้อย 1 บรรทัด");
    await runOnItems(async () => {
      await adminApi.post("/mystery-box-prize-stock", {
        box_product_id: itemsPrize.box_product_id,
        prize_id: itemsPrize.id,
        items: lines,
      });
      setItemsText("");
    }, `เพิ่มสต็อก ${lines.length} รายการเรียบร้อย`);
  }

  async function runSimulation() {
    const qty = Number(simInput.qty);
    const trials = Number(simInput.trials);
    if (!Number.isFinite(qty) || qty < 1 || qty > 20) return toast.error("จำนวนกล่องต่อรอบต้องอยู่ระหว่าง 1-20");
    if (!Number.isFinite(trials) || trials < 1 || trials > 20000) return toast.error("จำนวนรอบต้องอยู่ระหว่าง 1-20,000");
    setBusy(true);
    try {
      const res = await adminApi.get<{ simulation: Simulation }>(
        `/mystery-box/simulate?box_product_id=${boxProductId}&qty=${qty}&trials=${trials}`,
      );
      setSimulation(res.simulation ?? null);
    } catch (err) {
      toast.error(getErrorMessage(err, "ทดลองสุ่มไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  const kindHint = PRIZE_KINDS.find((k) => k.value === prizeForm.prize_kind)?.hint ?? "";

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="flex-row items-center justify-between gap-3 border-b px-4 py-3">
          <CardTitle className="text-base">คลังรางวัลกล่องสุ่ม</CardTitle>
          <div className="flex items-center gap-2">
            <NativeSelect
              value={boxProductId}
              onChange={(e) => loadPrizes(e.target.value)}
              className="w-56"
              aria-label="เลือกกล่องสุ่ม"
            >
              <NativeSelectOption value="">เลือกกล่องสุ่ม...</NativeSelectOption>
              {boxProducts.map((p) => (
                <NativeSelectOption key={p.id} value={String(p.id)}>
                  #{p.id} {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              variant="outline"
              size="sm"
              disabled={!boxProductId || busy}
              onClick={() => {
                setSimulation(null);
                setSimDialogOpen(true);
              }}
            >
              <Dices /> ทดลองสุ่ม
            </Button>
            <Button size="sm" disabled={!boxProductId || busy} onClick={openCreate}>
              <Plus /> เพิ่มรางวัล
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {boxProducts.length === 0 ? (
            <div className="px-4 py-10 text-center text-muted-foreground text-sm">
              ยังไม่มีสินค้าประเภทกล่องสุ่ม — สร้างสินค้าแล้วเลือกประเภทกล่องสุ่มในหน้าแคตตาล็อกก่อน
            </div>
          ) : !boxProductId ? (
            <div className="px-4 py-10 text-center text-muted-foreground text-sm">เลือกกล่องสุ่มด้านบนเพื่อดูรางวัลข้างใน</div>
          ) : (
            <div className="max-h-[30rem] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>รางวัล</TableHead>
                    <TableHead>ประเภท</TableHead>
                    <TableHead className="text-right">น้ำหนัก</TableHead>
                    <TableHead className="text-right">โควตา</TableHead>
                    <TableHead className="text-right">สต็อก</TableHead>
                    <TableHead>โอกาสจริง</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prizes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        กล่องนี้ยังไม่มีรางวัล
                      </TableCell>
                    </TableRow>
                  )}
                  {prizes.map((prize) => {
                    const state = drawState(prize);
                    const pct = Number(prize.probability_percent ?? 0);
                    return (
                      <TableRow key={prize.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {prize.prize_image_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={prize.prize_image_url} alt="" className="size-8 shrink-0 rounded object-cover" />
                            )}
                            <div className="min-w-0">
                              <div className="max-w-52 truncate font-medium text-sm">{prizeLabel(prize)}</div>
                              {prize.prize_product_name && (
                                <div className="max-w-52 truncate text-muted-foreground text-xs">
                                  ผูกกับ {prize.prize_product_name}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{prize.prize_kind}</TableCell>
                        <TableCell className="text-right tabular-nums">{prize.weight}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(prize.remaining)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {prize.prize_kind === "salt" ? "-" : formatNumber(prize.prize_available_stock ?? 0)}
                        </TableCell>
                        <TableCell>
                          {state.ok ? (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                              </div>
                              <span className="text-xs tabular-nums">{pct.toFixed(2)}%</span>
                            </div>
                          ) : (
                            <Badge variant="outline">0% · {state.reason}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {prize.prize_kind === "product" && (
                              <Button variant="ghost" size="icon-xs" disabled={busy} onClick={() => openItems(prize)}>
                                <Layers />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon-xs" disabled={busy} onClick={() => openEdit(prize)}>
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              disabled={busy}
                              onClick={() => run(() => adminApi.delete(`/mystery-box-prizes/${prize.id}`), "ลบรางวัลเรียบร้อย")}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        {boxProductId && prizes.length > 0 && (
          <div className="border-t px-4 py-2 text-muted-foreground text-xs">
            โอกาสจริงคำนวณสดจากน้ำหนัก โควตา และสต็อกที่เหลือ ณ ตอนนี้ — รวม {totalOdds.toFixed(2)}%
          </div>
        )}
      </Card>

      <FormDialog
        open={prizeDialogOpen}
        onOpenChange={setPrizeDialogOpen}
        size="lg"
        title={editing ? `แก้ไขรางวัล #${prizeForm.id}` : "เพิ่มรางวัลใหม่"}
        description={kindHint}
        footer={
          <>
            <Button variant="outline" onClick={() => setPrizeDialogOpen(false)} disabled={busy}>
              ยกเลิก
            </Button>
            <Button onClick={savePrize} disabled={busy}>
              {editing ? "บันทึก" : "เพิ่มรางวัล"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {!editing && (
            <div className="grid gap-1.5">
              <Label>ประเภทรางวัล</Label>
              <NativeSelect
                value={prizeForm.prize_kind}
                onChange={(e) => setPrizeForm((prev) => ({ ...prev, prize_kind: e.target.value as PrizeKind }))}
              >
                {PRIZE_KINDS.map((k) => (
                  <NativeSelectOption key={k.value} value={k.value}>
                    {k.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>ชื่อรางวัล</Label>
            <Input
              value={prizeForm.prize_name}
              onChange={(e) => setPrizeForm((prev) => ({ ...prev, prize_name: e.target.value }))}
              placeholder={prizeForm.prize_kind === "linked_product" ? "เว้นว่างเพื่อใช้ชื่อสินค้าที่ผูกไว้" : "เช่น สกินหายาก"}
            />
          </div>

          {!editing && prizeForm.prize_kind === "linked_product" && (
            <div className="grid gap-1.5">
              <Label>สินค้าที่ผูกสต็อก</Label>
              <NativeSelect
                value={prizeForm.prize_product_id}
                onChange={(e) => setPrizeForm((prev) => ({ ...prev, prize_product_id: e.target.value }))}
              >
                <NativeSelectOption value="">เลือกสินค้า...</NativeSelectOption>
                {prizeSourceProducts.map((p) => (
                  <NativeSelectOption key={p.id} value={String(p.id)}>
                    #{p.id} {p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}

          <ImageUploadCropper
            value={prizeForm.prize_image_url}
            onChange={(url) => setPrizeForm((prev) => ({ ...prev, prize_image_url: url }))}
            label="รูปรางวัล"
            aspectRatio={1}
            disabled={busy}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>น้ำหนักโอกาส</Label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={prizeForm.weight}
                onChange={(e) => setPrizeForm((prev) => ({ ...prev, weight: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>โควตาคงเหลือ</Label>
              <Input
                type="number"
                min="0"
                value={prizeForm.remaining}
                disabled={!editing && prizeForm.prize_kind === "product"}
                onChange={(e) => setPrizeForm((prev) => ({ ...prev, remaining: e.target.value }))}
              />
              {prizeForm.prize_kind === "product" && (
                <p className="text-muted-foreground text-xs">นับจากสต็อกที่แนบให้อัตโนมัติ</p>
              )}
            </div>
          </div>

          {!editing && prizeForm.prize_kind === "product" && (
            <div className="grid gap-1.5">
              <Label>สต็อกรางวัล (บรรทัดละ 1 รายการ)</Label>
              <Textarea rows={5} value={prizeStockText} onChange={(e) => setPrizeStockText(e.target.value)} />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={prizeForm.is_active}
              onCheckedChange={(checked) => setPrizeForm((prev) => ({ ...prev, is_active: checked === true }))}
            />
            เปิดให้สุ่มได้ทันที
          </label>
        </div>
      </FormDialog>

      <FormDialog
        open={itemsDialogOpen}
        onOpenChange={setItemsDialogOpen}
        size="xl"
        title={itemsPrize ? `สต็อกของ ${prizeLabel(itemsPrize)}` : "สต็อกรางวัล"}
        description="รายการที่ถูกจองไว้แล้วจะไม่ถูกสุ่มซ้ำ คืนสถานะได้ถ้าออเดอร์นั้นยกเลิกไป"
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label>เพิ่มสต็อก (บรรทัดละ 1 รายการ)</Label>
            <Textarea rows={4} value={itemsText} onChange={(e) => setItemsText(e.target.value)} />
            <div>
              <Button size="sm" onClick={addItems} disabled={busy}>
                <Plus /> เพิ่มสต็อก
              </Button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รายการ</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>เพิ่มเมื่อ</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      ยังไม่มีสต็อกในรางวัลนี้
                    </TableCell>
                  </TableRow>
                )}
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-72 truncate font-mono text-xs">{item.payload}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === "available" ? "secondary" : "outline"}>{item.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{item.created_at ? formatDateTime(item.created_at) : "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {item.status !== "available" && (
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={busy}
                            onClick={() =>
                              runOnItems(
                                () => adminApi.put(`/mystery-box-prize-stock-items/${item.id}`, { status: "available" }),
                                "คืนสต็อกรายการนี้กลับเป็นพร้อมสุ่มแล้ว",
                              )
                            }
                          >
                            คืนสต็อก
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={busy}
                          onClick={() =>
                            runOnItems(
                              () => adminApi.delete(`/mystery-box-prize-stock-items/${item.id}`),
                              "ลบสต็อกรางวัลเรียบร้อย",
                            )
                          }
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
        </div>
      </FormDialog>

      <FormDialog
        open={simDialogOpen}
        onOpenChange={setSimDialogOpen}
        size="xl"
        title="ทดลองสุ่มกล่อง"
        description="สุ่มจำลองบนเซิร์ฟเวอร์ด้วยน้ำหนักและสต็อกจริง ไม่ตัดสต็อกและไม่สร้างออเดอร์"
        footer={
          <Button onClick={runSimulation} disabled={busy}>
            <Dices /> เริ่มทดลองสุ่ม
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>กล่องต่อรอบ (1-20)</Label>
              <Input
                type="number"
                min="1"
                max="20"
                value={simInput.qty}
                onChange={(e) => setSimInput((prev) => ({ ...prev, qty: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>จำนวนรอบ (1-20,000)</Label>
              <Input
                type="number"
                min="1"
                max="20000"
                value={simInput.trials}
                onChange={(e) => setSimInput((prev) => ({ ...prev, trials: e.target.value }))}
              />
            </div>
          </div>

          {simulation && (
            <>
              <p className="text-muted-foreground text-sm">
                สุ่มทั้งหมด {formatNumber(simulation.total_draws)} ครั้ง ({formatNumber(simulation.trials)} รอบ ×{" "}
                {simulation.qty_per_trial} กล่อง)
              </p>
              <div className="max-h-72 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>รางวัล</TableHead>
                      <TableHead className="text-right">ออกจริง</TableHead>
                      <TableHead className="text-right">คาดหวัง</TableHead>
                      <TableHead className="text-right">สัดส่วน</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {simulation.results.map((row) => (
                      <TableRow key={row.prize_id}>
                        <TableCell className="max-w-52 truncate text-sm">{prizeLabel(row)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(row.hits)}</TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {formatNumber(row.expected_hits)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.probability_percent.toFixed(2)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </FormDialog>
    </>
  );
}
