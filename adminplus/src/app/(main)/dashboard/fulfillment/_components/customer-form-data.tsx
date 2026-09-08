"use client";

import { useState } from "react";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FormFieldDef = { id?: string; label?: string; type?: string };

export type CustomerSubmission = {
  form_data?: unknown;
  farm_form_fields?: unknown;
  /** Legacy per-column values kept for products created before custom form fields. */
  uid?: string | null;
  uid_confirmed?: boolean | null;
  username?: string | null;
  password?: string | null;
  auth_key?: string | null;
};

type Row = { key: string; label: string; value: string; secret?: boolean };

/** Renders a submitted value the way a human reads it, not the way it's stored. */
function displayValue(value: unknown): string {
  if (value === true) return "ใช่";
  if (value === false) return "ไม่ใช่";
  if (value == null) return "";
  return String(value);
}

/**
 * Turns a fulfillment request's submission into labelled rows: the customer's answers
 * keyed by field id are matched against the product's farm_form_fields so staff see
 * "UID ในเกม" instead of "field_mmp33ada_3p99".
 */
export function buildSubmissionRows(request: CustomerSubmission): Row[] {
  const defs = Array.isArray(request.farm_form_fields) ? (request.farm_form_fields as FormFieldDef[]) : [];
  const labels = new Map(defs.map((d) => [String(d.id ?? ""), String(d.label || d.id || "")]));
  const rows: Row[] = [];

  // Legacy columns first — these predate custom form fields.
  if (request.uid) rows.push({ key: "uid", label: "UID / Game ID", value: String(request.uid) });
  if (request.username) rows.push({ key: "username", label: "Username / Account", value: String(request.username) });
  if (request.password) rows.push({ key: "password", label: "Password", value: String(request.password), secret: true });
  if (request.auth_key) rows.push({ key: "auth_key", label: "Auth Key / 2FA Backup", value: String(request.auth_key), secret: true });

  const data = request.form_data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const [key, raw] of Object.entries(data as Record<string, unknown>)) {
      const value = displayValue(raw);
      if (!value) continue;
      const label = labels.get(key) || key;
      const isSecret = /pass|secret|key|token/i.test(label) || /pass|secret|key|token/i.test(key);
      rows.push({ key, label, value, secret: isSecret });
    }
  }

  return rows;
}

function SubmissionRow({ row }: { row: Row }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(row.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  }

  const hidden = row.secret && !revealed;

  return (
    <div className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-xs">{row.label}</div>
        <div className={cn("break-all font-mono text-sm", hidden && "tracking-widest")}>
          {hidden ? "••••••••••••" : row.value}
        </div>
      </div>
      {row.secret && (
        <Button type="button" variant="ghost" size="icon-xs" onClick={() => setRevealed((v) => !v)} title={revealed ? "ซ่อน" : "แสดง"}>
          {revealed ? <EyeOff /> : <Eye />}
        </Button>
      )}
      <Button type="button" variant="ghost" size="icon-xs" onClick={copy} title="คัดลอก">
        {copied ? <Check className="text-emerald-600" /> : <Copy />}
      </Button>
    </div>
  );
}

export function CustomerFormData({ request }: { request: CustomerSubmission }) {
  const rows = buildSubmissionRows(request);

  if (rows.length === 0) {
    return (
      <div>
        <p className="mb-1 text-muted-foreground text-xs">ข้อมูลจากลูกค้า</p>
        <p className="rounded-lg border border-dashed py-4 text-center text-muted-foreground text-xs">ลูกค้าไม่ได้กรอกข้อมูลเพิ่มเติม</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-muted-foreground text-xs">ข้อมูลจากลูกค้า</p>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(rows.map((r) => `${r.label}: ${r.value}`).join("\n"));
              toast.success("คัดลอกข้อมูลทั้งหมดแล้ว");
            } catch {
              toast.error("คัดลอกไม่สำเร็จ");
            }
          }}
        >
          <Copy /> คัดลอกทั้งหมด
        </Button>
      </div>
      <div className="rounded-lg border">
        {rows.map((row) => (
          <SubmissionRow key={row.key} row={row} />
        ))}
      </div>
    </div>
  );
}
