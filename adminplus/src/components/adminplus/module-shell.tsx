import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SPLITWISE_API_BASE } from "@/lib/adminplus/config";

const ERROR_TH: Record<string, string> = {
  unauthorized: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
  forbidden: "บัญชีนี้ไม่มีสิทธิ์เข้าถึงโมดูลนี้",
  splitwise_unreachable: `เชื่อมต่อ splitwise server ไม่ได้ (${SPLITWISE_API_BASE})`,
};

export function ModuleHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-semibold text-xl leading-none">{title}</h1>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

export function ModuleError({ title, error }: { title: string; error: unknown }) {
  const code = error instanceof Error ? error.message : String(error);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>โหลดข้อมูลไม่สำเร็จ</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-destructive text-sm">{ERROR_TH[code] ?? code}</p>
        <p className="text-muted-foreground text-xs">
          ตรวจสอบว่า splitwise server รันอยู่ที่ {SPLITWISE_API_BASE} และบัญชีที่ล็อกอินมีสิทธิ์เข้าถึงโมดูลนี้
        </p>
      </CardContent>
    </Card>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="gap-0 py-4">
      <CardHeader className="px-4">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </CardHeader>
    </Card>
  );
}
