"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export type FormField = { id: string; label: string; type: "text" | "checkbox"; required: boolean };
export type ProductOption = { id: string; label: string; value: string; price_points: number | string };

const FIELD_TYPES: { value: FormField["type"]; label: string }[] = [
  { value: "text", label: "ช่องกรอกข้อความ" },
  { value: "checkbox", label: "เช็คบ็อกซ์ (ติ๊กยืนยัน)" },
];

/** Matches AdminV3's normalizeCustomFormFieldId. */
export function normalizeFieldId(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/** Matches AdminV3's normalizeProductOptionId (hyphens allowed here). */
export function normalizeOptionId(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function createFormField(type: FormField["type"] = "text"): FormField {
  return {
    id: `field_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: "",
    type,
    required: false,
  };
}

export function createProductOption(): ProductOption {
  return { id: "", label: "", value: "", price_points: 0 };
}

/** Reads whatever the API returned into editor rows. */
export function parseFormFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row, index) => {
    const field = (row ?? {}) as Partial<FormField>;
    const label = String(field.label ?? "").trim() || `Field ${index + 1}`;
    return {
      id: normalizeFieldId(String(field.id ?? "")) || normalizeFieldId(label) || `field_${index + 1}`,
      label,
      type: field.type === "checkbox" ? "checkbox" : "text",
      required: Boolean(field.required),
    };
  });
}

export function parseProductOptions(raw: unknown): ProductOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const opt = (row ?? {}) as Partial<ProductOption>;
    return {
      id: String(opt.id ?? ""),
      label: String(opt.label ?? ""),
      value: opt.value == null ? "" : String(opt.value),
      price_points: Number(opt.price_points ?? 0),
    };
  });
}

/** Drops blank rows and validates, throwing a message meant for a toast. */
export function normalizeFormFieldsForSubmit(fields: FormField[]): FormField[] {
  const seen = new Set<string>();
  const rows: FormField[] = [];
  fields.forEach((row, index) => {
    const label = String(row.label ?? "").trim();
    const rawId = String(row.id ?? "").trim();
    const type: FormField["type"] = row.type === "checkbox" ? "checkbox" : "text";
    if (!label && !rawId && !row.required) return; // untouched blank row
    if (!label) throw new Error(`ฟิลด์ที่ ${index + 1}: กรุณากรอกชื่อฟิลด์`);
    const id = normalizeFieldId(rawId || label) || `field_${index + 1}`;
    if (seen.has(id)) throw new Error(`ฟิลด์ที่ ${index + 1}: รหัสฟิลด์ "${id}" ซ้ำกับฟิลด์อื่น`);
    seen.add(id);
    rows.push({ id, label, type, required: Boolean(row.required) });
  });
  return rows;
}

export function normalizeProductOptionsForSubmit(options: ProductOption[]): ProductOption[] {
  const seen = new Set<string>();
  const rows: ProductOption[] = [];
  options.forEach((row, index) => {
    const label = String(row.label ?? "").trim();
    const rawId = String(row.id ?? "").trim();
    const value = String(row.value ?? "").trim();
    const rawPrice = String(row.price_points ?? "").trim();
    if (!label && !rawId && !value && !rawPrice) return;
    if (!label) throw new Error(`ตัวเลือกที่ ${index + 1}: กรุณากรอกชื่อตัวเลือก`);
    const id = normalizeOptionId(rawId || label);
    if (!id) throw new Error(`ตัวเลือกที่ ${index + 1}: รหัสตัวเลือกไม่ถูกต้อง`);
    if (seen.has(id)) throw new Error(`ตัวเลือกที่ ${index + 1}: รหัส "${id}" ซ้ำกับตัวเลือกอื่น`);
    const price = Number(row.price_points);
    if (!Number.isFinite(price) || price < 0) throw new Error(`ตัวเลือกที่ ${index + 1}: ราคาต้องเป็นตัวเลขไม่ติดลบ`);
    seen.add(id);
    rows.push({ id, label, value, price_points: Math.round(price) });
  });
  return rows;
}

function move<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function RowShell({
  index,
  total,
  onMove,
  onRemove,
  disabled,
  children,
}: {
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-2.5">
      <div className="mb-2 flex items-center gap-1">
        <span className="text-muted-foreground text-xs">#{index + 1}</span>
        <div className="ml-auto flex gap-0.5">
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => onMove(-1)} disabled={disabled || index === 0}>
            <ArrowUp />
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => onMove(1)} disabled={disabled || index === total - 1}>
            <ArrowDown />
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={onRemove} disabled={disabled}>
            <X />
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * Visual editor for a product's farm-form fields — the replacement for AdminV3's
 * raw JSON box. Field ids are derived from the label unless the operator sets one.
 */
export function FormFieldsEditor({
  fields,
  onChange,
  disabled,
  label = "ฟิลด์ที่ให้ลูกค้ากรอก",
}: {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  function update(index: number, patch: Partial<FormField>) {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  return (
    <div>
      <Label className="mb-1.5 block font-normal text-muted-foreground text-xs">
        {label} · {fields.length} ฟิลด์
      </Label>

      <div className="flex flex-col gap-2">
        {fields.length === 0 && (
          <p className="rounded-lg border border-dashed py-4 text-center text-muted-foreground text-xs">
            ยังไม่มีฟิลด์ — กดปุ่มด้านล่างเพื่อเพิ่ม
          </p>
        )}

        {fields.map((field, index) => (
          <RowShell
            key={field.id || index}
            index={index}
            total={fields.length}
            onMove={(dir) => onChange(move(fields, index, dir))}
            onRemove={() => onChange(fields.filter((_, i) => i !== index))}
            disabled={disabled}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="mb-1 block font-normal text-muted-foreground text-xs">ข้อความที่แสดงให้ลูกค้า</Label>
                <Input
                  value={field.label}
                  onChange={(e) => update(index, { label: e.target.value })}
                  placeholder="เช่น UID ในเกม"
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="mb-1 block font-normal text-muted-foreground text-xs">ชนิดฟิลด์</Label>
                <NativeSelect
                  value={field.type}
                  onChange={(e) => update(index, { type: e.target.value === "checkbox" ? "checkbox" : "text" })}
                  disabled={disabled}
                  className="w-full"
                >
                  {FIELD_TYPES.map((t) => (
                    <NativeSelectOption key={t.value} value={t.value}>
                      {t.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={field.required} onCheckedChange={(c) => update(index, { required: Boolean(c) })} disabled={disabled} />
                บังคับกรอก
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-xs">รหัสฟิลด์</span>
                <Input
                  value={field.id}
                  onChange={(e) => update(index, { id: e.target.value })}
                  onBlur={(e) => update(index, { id: normalizeFieldId(e.target.value) || normalizeFieldId(field.label) })}
                  placeholder="เว้นว่างให้สร้างจากชื่อ"
                  disabled={disabled}
                  className="h-7 w-48 font-mono text-xs"
                />
              </div>
            </div>
          </RowShell>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...fields, createFormField("text")])} disabled={disabled}>
          <Plus /> เพิ่มช่องข้อความ
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...fields, createFormField("checkbox")])} disabled={disabled}>
          <Plus /> เพิ่มเช็คบ็อกซ์
        </Button>
      </div>
    </div>
  );
}

/** The storefront renders at most 12 highlight lines (ProductDetail.jsx). */
export const MAX_HIGHLIGHTS = 12;

export function splitHighlights(raw: string): string[] {
  return String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function joinHighlights(lines: string[]): string {
  return lines.map((line) => line.trim()).filter(Boolean).join("\n");
}

/**
 * Bullet-list editor for product highlights. Stored as one line per bullet,
 * which is what the storefront splits on.
 */
export function HighlightsEditor({
  lines,
  onChange,
  disabled,
}: {
  lines: string[];
  onChange: (lines: string[]) => void;
  disabled?: boolean;
}) {
  const overLimit = lines.length > MAX_HIGHLIGHTS;

  return (
    <div>
      <Label className="mb-1.5 block font-normal text-muted-foreground text-xs">
        จุดเด่นของสินค้า · {lines.length}/{MAX_HIGHLIGHTS} ข้อ
      </Label>

      <div className="flex flex-col gap-1.5">
        {lines.length === 0 && (
          <p className="rounded-lg border border-dashed py-3 text-center text-muted-foreground text-xs">
            ยังไม่มีจุดเด่น — กดเพิ่มเพื่อแสดงเป็นรายการติ๊กถูกในหน้าสินค้า
          </p>
        )}

        {lines.map((line, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <span className="w-5 shrink-0 text-center text-muted-foreground text-xs">{index + 1}</span>
            <Input
              value={line}
              onChange={(e) => onChange(lines.map((l, i) => (i === index ? e.target.value : l)))}
              placeholder="เช่น ส่งของอัตโนมัติทันทีหลังชำระเงิน"
              disabled={disabled}
              className={index >= MAX_HIGHLIGHTS ? "border-destructive" : undefined}
            />
            <Button type="button" variant="ghost" size="icon-xs" onClick={() => onChange(move(lines, index, -1))} disabled={disabled || index === 0}>
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => onChange(move(lines, index, 1))}
              disabled={disabled || index === lines.length - 1}
            >
              <ArrowDown />
            </Button>
            <Button type="button" variant="ghost" size="icon-xs" onClick={() => onChange(lines.filter((_, i) => i !== index))} disabled={disabled}>
              <X />
            </Button>
          </div>
        ))}
      </div>

      {overLimit && <p className="mt-1 text-destructive text-xs">หน้าสินค้าจะแสดงแค่ {MAX_HIGHLIGHTS} ข้อแรกเท่านั้น</p>}

      <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => onChange([...lines, ""])} disabled={disabled}>
        <Plus /> เพิ่มจุดเด่น
      </Button>
    </div>
  );
}

/** Visual editor for product options (id / label / value / price). */
export function ProductOptionsEditor({
  options,
  onChange,
  disabled,
}: {
  options: ProductOption[];
  onChange: (options: ProductOption[]) => void;
  disabled?: boolean;
}) {
  function update(index: number, patch: Partial<ProductOption>) {
    onChange(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  return (
    <div>
      <Label className="mb-1.5 block font-normal text-muted-foreground text-xs">
        ตัวเลือกสินค้า · {options.length} รายการ
      </Label>

      <div className="flex flex-col gap-2">
        {options.length === 0 && (
          <p className="rounded-lg border border-dashed py-4 text-center text-muted-foreground text-xs">
            ไม่มีตัวเลือก — สินค้าจะขายแบบเดี่ยวตามราคาหลัก
          </p>
        )}

        {options.map((option, index) => (
          <RowShell
            key={index}
            index={index}
            total={options.length}
            onMove={(dir) => onChange(move(options, index, dir))}
            onRemove={() => onChange(options.filter((_, i) => i !== index))}
            disabled={disabled}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="mb-1 block font-normal text-muted-foreground text-xs">ชื่อตัวเลือก</Label>
                <Input
                  value={option.label}
                  onChange={(e) => update(index, { label: e.target.value })}
                  placeholder="เช่น แพ็กเล็ก 100 เพชร"
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="mb-1 block font-normal text-muted-foreground text-xs">ราคา (พอยท์)</Label>
                <Input
                  type="number"
                  min={0}
                  value={option.price_points}
                  onChange={(e) => update(index, { price_points: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="mb-1 block font-normal text-muted-foreground text-xs">รหัสตัวเลือก</Label>
                <Input
                  value={option.id}
                  onChange={(e) => update(index, { id: e.target.value })}
                  onBlur={(e) => update(index, { id: normalizeOptionId(e.target.value) || normalizeOptionId(option.label) })}
                  placeholder="เว้นว่างให้สร้างจากชื่อ"
                  disabled={disabled}
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <Label className="mb-1 block font-normal text-muted-foreground text-xs">ค่าที่ส่งให้ระบบ (ไม่บังคับ)</Label>
                <Input value={option.value} onChange={(e) => update(index, { value: e.target.value })} disabled={disabled} />
              </div>
            </div>
          </RowShell>
        ))}
      </div>

      <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => onChange([...options, createProductOption()])} disabled={disabled}>
        <Plus /> เพิ่มตัวเลือก
      </Button>
    </div>
  );
}
