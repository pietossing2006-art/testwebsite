"use client";

import { useState } from "react";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type LinkItem = { label: string; url: string };
export type SocialItem = { platform: string; url: string };
export type NavbarLink = { label: string; to: string; auth_required: boolean };
export type FaqItem = { question: string; answer: string };
export type TrustItem = { icon: string; title: string; desc: string };

function move<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function ListShell<T>({
  label,
  items,
  max,
  onChange,
  makeNew,
  disabled,
  emptyText,
  addText,
  renderRow,
}: {
  label: string;
  items: T[];
  max: number;
  onChange: (items: T[]) => void;
  makeNew: () => T;
  disabled?: boolean;
  emptyText: string;
  addText: string;
  renderRow: (item: T, index: number, update: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  const atLimit = items.length >= max;

  return (
    <div>
      <Label className="mb-1.5 block font-normal text-muted-foreground text-xs">
        {label} · {items.length}/{max}
      </Label>

      <div className="flex flex-col gap-2">
        {items.length === 0 && (
          <p className="rounded-lg border border-dashed py-3 text-center text-muted-foreground text-xs">{emptyText}</p>
        )}

        {items.map((item, index) => (
          <div key={index} className={cn("rounded-lg border p-2.5", index >= max && "border-destructive")}>
            <div className="mb-2 flex items-center gap-1">
              <span className="text-muted-foreground text-xs">#{index + 1}</span>
              <div className="ml-auto flex gap-0.5">
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => onChange(move(items, index, -1))} disabled={disabled || index === 0}>
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onChange(move(items, index, 1))}
                  disabled={disabled || index === items.length - 1}
                >
                  <ArrowDown />
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => onChange(items.filter((_, i) => i !== index))} disabled={disabled}>
                  <X />
                </Button>
              </div>
            </div>
            {renderRow(item, index, (patch) => onChange(items.map((row, i) => (i === index ? { ...row, ...patch } : row))))}
          </div>
        ))}
      </div>

      {items.length > max && <p className="mt-1 text-destructive text-xs">ระบบจะบันทึกแค่ {max} รายการแรก</p>}

      <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => onChange([...items, makeNew()])} disabled={disabled || atLimit}>
        <Plus /> {addText}
      </Button>
    </div>
  );
}

export function LinkListEditor({
  label,
  links,
  onChange,
  max = 12,
  disabled,
}: {
  label: string;
  links: LinkItem[];
  onChange: (links: LinkItem[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <ListShell
      label={label}
      items={links}
      max={max}
      onChange={onChange}
      makeNew={() => ({ label: "", url: "" })}
      disabled={disabled}
      emptyText="ยังไม่มีลิงก์"
      addText="เพิ่มลิงก์"
      renderRow={(item, _i, update) => (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={item.label} onChange={(e) => update({ label: e.target.value })} placeholder="ข้อความลิงก์" disabled={disabled} />
          <Input value={item.url} onChange={(e) => update({ url: e.target.value })} placeholder="/page หรือ https://…" disabled={disabled} />
        </div>
      )}
    />
  );
}

const SOCIAL_PRESETS = ["facebook", "discord", "line", "instagram", "tiktok", "youtube", "x", "email"];

export function SocialLinksEditor({
  links,
  onChange,
  disabled,
}: {
  links: SocialItem[];
  onChange: (links: SocialItem[]) => void;
  disabled?: boolean;
}) {
  return (
    <ListShell
      label="โซเชียล"
      items={links}
      max={10}
      onChange={onChange}
      makeNew={() => ({ platform: "", url: "" })}
      disabled={disabled}
      emptyText="ยังไม่มีช่องทางโซเชียล"
      addText="เพิ่มช่องทาง"
      renderRow={(item, _i, update) => (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={item.platform} onChange={(e) => update({ platform: e.target.value })} placeholder="ชื่อแพลตฟอร์ม" disabled={disabled} />
            <Input value={item.url} onChange={(e) => update({ url: e.target.value })} placeholder="https://…" disabled={disabled} />
          </div>
          <div className="flex flex-wrap gap-1">
            {SOCIAL_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="xs"
                variant={item.platform === preset ? "default" : "outline"}
                onClick={() => update({ platform: preset })}
                disabled={disabled}
              >
                {preset}
              </Button>
            ))}
          </div>
        </div>
      )}
    />
  );
}

export function NavbarLinksEditor({
  links,
  onChange,
  disabled,
}: {
  links: NavbarLink[];
  onChange: (links: NavbarLink[]) => void;
  disabled?: boolean;
}) {
  return (
    <ListShell
      label="เมนูบน navbar"
      items={links}
      max={10}
      onChange={onChange}
      makeNew={() => ({ label: "", to: "/", auth_required: false })}
      disabled={disabled}
      emptyText="ยังไม่มีเมนูเพิ่มเติม"
      addText="เพิ่มเมนู"
      renderRow={(item, _i, update) => (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={item.label} onChange={(e) => update({ label: e.target.value })} placeholder="ชื่อเมนู" disabled={disabled} />
            <Input value={item.to} onChange={(e) => update({ to: e.target.value })} placeholder="/shop หรือ https://…" disabled={disabled} className="font-mono text-xs" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={item.auth_required} onCheckedChange={(c) => update({ auth_required: Boolean(c) })} disabled={disabled} />
            แสดงเฉพาะคนที่ล็อกอินแล้ว
          </label>
        </div>
      )}
    />
  );
}

export function FaqEditor({ items, onChange, disabled }: { items: FaqItem[]; onChange: (items: FaqItem[]) => void; disabled?: boolean }) {
  return (
    <ListShell
      label="คำถามที่พบบ่อย (FAQ)"
      items={items}
      max={20}
      onChange={onChange}
      makeNew={() => ({ question: "", answer: "" })}
      disabled={disabled}
      emptyText="ยังไม่มี FAQ"
      addText="เพิ่มคำถาม"
      renderRow={(item, _i, update) => (
        <div className="flex flex-col gap-2">
          <Input value={item.question} onChange={(e) => update({ question: e.target.value })} placeholder="คำถาม" disabled={disabled} />
          <Textarea rows={2} value={item.answer} onChange={(e) => update({ answer: e.target.value })} placeholder="คำตอบ" disabled={disabled} />
        </div>
      )}
    />
  );
}

const TRUST_ICON_PRESETS = ["🛡️", "⚡", "💬", "🔒", "✅", "🚀", "💎", "🕒"];

export function TrustItemsEditor({ items, onChange, disabled }: { items: TrustItem[]; onChange: (items: TrustItem[]) => void; disabled?: boolean }) {
  return (
    <ListShell
      label="จุดสร้างความมั่นใจ (แสดงบนหน้าแรก)"
      items={items}
      max={10}
      onChange={onChange}
      makeNew={() => ({ icon: "🛡️", title: "", desc: "" })}
      disabled={disabled}
      emptyText="ยังไม่มีรายการ"
      addText="เพิ่มรายการ"
      renderRow={(item, _i, update) => (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-[6rem_1fr]">
            <Input value={item.icon} onChange={(e) => update({ icon: e.target.value })} placeholder="ไอคอน" disabled={disabled} className="text-center" />
            <Input value={item.title} onChange={(e) => update({ title: e.target.value })} placeholder="หัวข้อ" disabled={disabled} />
          </div>
          <Input value={item.desc} onChange={(e) => update({ desc: e.target.value })} placeholder="คำอธิบายสั้น ๆ" disabled={disabled} />
          <div className="flex flex-wrap gap-1">
            {TRUST_ICON_PRESETS.map((icon) => (
              <Button key={icon} type="button" size="xs" variant={item.icon === icon ? "default" : "outline"} onClick={() => update({ icon })} disabled={disabled}>
                {icon}
              </Button>
            ))}
          </div>
        </div>
      )}
    />
  );
}

/** Multi-select for picking products by id, with search — used for featured/showcase slots. */
export function ProductPicker({
  label,
  hint,
  selected,
  products,
  onChange,
  max,
  disabled,
}: {
  label: string;
  hint?: string;
  selected: number[];
  products: { id: number; name: string }[];
  onChange: (ids: number[]) => void;
  max: number;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const byId = new Map(products.map((p) => [p.id, p]));
  const q = search.trim().toLowerCase();
  const matches = q ? products.filter((p) => p.name.toLowerCase().includes(q) && !selected.includes(p.id)).slice(0, 8) : [];

  return (
    <div>
      <Label className="mb-1.5 block font-normal text-muted-foreground text-xs">
        {label} · {selected.length}/{max}
      </Label>

      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((id, index) => (
            <Badge key={id} variant="secondary" className="h-7 gap-1 pr-1">
              <span className="max-w-40 truncate">{byId.get(id)?.name ?? `#${id}`}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-5"
                onClick={() => onChange(selected.filter((_, i) => i !== index))}
                disabled={disabled}
              >
                <X />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={selected.length >= max ? `เลือกครบ ${max} รายการแล้ว` : "พิมพ์ชื่อสินค้าเพื่อค้นหาแล้วกดเลือก"}
        disabled={disabled || selected.length >= max}
      />

      {matches.length > 0 && (
        <ul className="mt-1 max-h-40 divide-y overflow-y-auto rounded-lg border">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50"
                onClick={() => {
                  onChange([...selected, p.id]);
                  setSearch("");
                }}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {hint && <p className="mt-1 text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
